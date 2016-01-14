/*
 * Evernote-webhooks: A project to use webhooks to automate things in Evernote
 */
var express = require('express');
var Evernote = require('evernote').Evernote;
var expressSession = require('express-session');
var Promisifier = require('./Promisifier');
var UsersMap = require('./UsersMap');

var config;
try {
  config = require('./config.json');
} catch (e) {
  config = {};
}

config.API_CONSUMER_KEY = config.API_CONSUMER_KEY || process.env.consumerKey;
config.API_CONSUMER_SECRET = config.API_CONSUMER_SECRET || process.env.consumerSecret;
config.SANDBOX = config.SANDBOX || process.env.sandbox || true;
// TODO(3): Is there a better name for this config?
config.SERVICE_BASE = config.SERVICE_BASE || process.env.serviceBase
                      || 'http://localhost:3000';
// The tag to look for
config.TARGET_TAG_NAME = config.TARGET_TAG_NAME || process.env.tagName || 'toc';
// The title to assign to newly created tables of contents
config.TOC_TITLE = config.TOC_TITLE || process.env.tocTitle || 'Table of Contents';

var oauthCallbackUrl = config.SERVICE_BASE + '/OAuthCallback';

var usersMap = new UsersMap();
var history = [];
var tocNotesByNotebook = {};

/**
 * Function to log an error and send it to res, or redirect to some target url
 */
var errorLogger = function(res, error, targetUrl) {
  console.log(error);
  if (typeof targetUrl === 'string') {
    res.redirect(targetUrl);
  } else {
    res.send(error);
  }
}

var createNote = function(noteStoreClient, title, content, notebookGuid) {
  var newNote = new Evernote.Note();
  newNote.title = title;
  newNote.content = content;
  newNote.notebookGuid = notebookGuid;
  return noteStoreClient.createNote(newNote);
}

var app = express();
var wwwDir = '/www';

app.use(expressSession({
  resave: false,
  saveUninitialized: false,
  secret: 'this is a secret'
}));
app.use('/', express.static(__dirname + wwwDir));

app.get('/', function(req, res) { res.render(wwwDir + '/index.html'); });

app.get('/error', function(req, res) {
  console.log('/error');
  console.log(req.session);
  res.send('An error occurred. <a href="http://www.sadtrombone.com/?autoplay=true">Womp womp</a>');
});

/**
 * The hook to receive Evernote events:
 * https://dev.evernote.com/doc/articles/polling_notification.php#webhooks
 * Logs the query to the history array
 * For our purposes, we only care about responding to note update events.
 */
app.get('/hook', function(req, res) {
  console.log('/hook');
  history.push(req.query);
  if (req.query && req.query.userId && req.query.guid && req.query.notebookGuid
    && (req.query.reason === 'update' || req.query.reason === 'business_update')) {
    // TODO(3): Do we really need to check the reason? Is just having the guid enough?
    // Are we incorrectly excluding 'create' events?

    // Look up this userId and get note info for this note
    var userInfo = usersMap.getInfoForUser(req.query.userId);
    if (userInfo && userInfo.oauthAccessToken) {
      // TODO(2): Store this information in a custom UserInfo object
      var client = new Evernote.Client({
        token: userInfo.oauthAccessToken,
        sandbox: config.SANDBOX
      });
      var promisifiedNoteStoreClient =
        Promisifier.promisifyObject(client.getNoteStore());

      var tagNamesPromise =
        promisifiedNoteStoreClient.getNoteTagNames(
          userInfo.oauthAccessToken, req.query.guid
        );

      // TODO(2): Save the notes with this tag and trigger the update of the ToC if a tag is deleted
      tagNamesPromise.then(function(tagNames) {
        // Try to find the target tag in the tags of this note.
        var upperCaseTagNames = tagNames.map(function(a) { return a.toUpperCase(); });
        if (upperCaseTagNames.indexOf(config.TARGET_TAG_NAME.toUpperCase()) > -1) {
          var noteFilter = new Evernote.NoteFilter({
            order: Evernote.NoteSortOrder.UPDATE, // sort by last updated time
            inactive: false,
            ascending: true, // oldest first
            notebookGuid: req.query.notebookGuid,
            words: 'tag:' + config.TARGET_TAG_NAME
          });
          var resultSpec = new Evernote.NotesMetadataResultSpec({
            includeTitle: true
          });

          return promisifiedNoteStoreClient.findNotesMetadata(
            userInfo.oauthAccessToken, noteFilter, 0, 100, resultSpec
          );
        } else {
          return new Promise(function(resolve, reject) {
            reject('Note ' + req.query.guid + ' does not have tag '
                    + config.TARGET_TAG_NAME);
          });
        }
      }).then(function(noteList) {
        // TODO(2): Check noteList.totalNotes to see if we need to call this again or not
        if (noteList.notes) {
          console.log('Found ' + noteList.notes.length + ' notes with tag');
          var noteLinkList = noteList.notes.reduce(function(partialList, note) {
            var noteUrl = 'evernote:///view/' + userInfo.userId + '/' + userInfo.shard
                    + '/' + note.guid + '/' + note.guid + '/';
            return partialList + '<div><a href="' + noteUrl + '">' + note.title + '</a></div>';
          }, '');

          var noteContent = '<?xml version=\"1.0\" encoding=\"UTF-8\"?>';
          noteContent += '<!DOCTYPE en-note SYSTEM \"http://xml.evernote.com/pub/enml2.dtd\">';
          noteContent += '<en-note>' + noteLinkList + '</en-note>';

          var tocNote;
          // TODO(3): Append to the existing note instead of overwriting it?
          // TODO(3): Look up by tag as a fallback
          // If there's an existing Table of Contents note that we created, use that instead
          if (tocNotesByNotebook[req.query.notebookGuid]) {
            var noteGuid = tocNotesByNotebook[req.query.notebookGuid];
            var promisedTocNote =
              promisifiedNoteStoreClient.getNote(
                userInfo.oauthAccessToken, noteGuid, true, false, false, false
              );

            return promisedTocNote.then(function(tocNote) {
              console.log('Found existing table of contents with title ' + tocNote.title
                          + '; updating');
              tocNote.content = noteContent;
              return promisifiedNoteStoreClient.updateNote(tocNote);
            }, function(error) {
              /* If this error is EDAMNotFound, check if it's due to a bad note guid. If
               * so, create a new note. See
               * https://dev.evernote.com/doc/reference/Errors.html#Struct_EDAMNotFoundException
               */
              if (error.identifier === 'Note.guid') {
                console.log('Saved table of contents note was not found; creating new note');
                return createNote(promisifiedNoteStoreClient, config.TOC_TITLE,
                                  noteContent, req.query.notebookGuid);
              } else {
                return new Promise((resolve, reject) => { reject(error) });
              }
            });
          } else {
            // Create new table of contents note
            console.log('No entry for this notebook; creating new note')
            return createNote(promisifiedNoteStoreClient, config.TOC_TITLE,
                              noteContent, req.query.notebookGuid);
          }
        } else {
          // This should never happen, because we got here by updating a note with the tag
          return new Promise(function(resolve, reject) {
            reject('No notes with tag found!');
          });
        }
      }).then(function(note) {
        // If we haven't created a ToC note for this notebook yet, do so.
        if (!tocNotesByNotebook[note.notebookGuid]) {
          tocNotesByNotebook[note.notebookGuid] = note.guid;
        }
        res.send('Successfully made ' + note.title + ' note ' + note.guid + ' in notebook ' + note.notebookGuid);
      }).catch(function(error) {
        // Something was wrong with one of our service calls
        // See EDAMErrorCode enumeration for error code explanation
        // http://dev.evernote.com/documentation/reference/Errors.html#Enum_EDAMErrorCode
        errorLogger(res, error);
      });
    } else {
      errorLogger(res, 'No saved information for user ' + req.query.userId);
    }
  } else {
    console.log('query is not a note update:');
    console.log(req.query);
    res.send('query is not a note update')
  }
});

/**
 * Lists all queries that we've captured in our history
 */
app.get('/history', function(req, res) {
  console.log('/history');
  var response = '';
  for (var i in history) {
    response += 'request ' + i + ': '
    response += JSON.stringify(history[i]);
    response += '<br>'
  }
  res.send(response);
});

/**
 * Logs some notes in case we want to inspect the details. Mainly for testing.
 * Provides a link that will fake an update webhook event for a given note.
 */
app.get('/listNotes', function(req, res) {
  console.log('/listNotes');
  if (req.query && req.query.userId) {
    var userInfo = usersMap.getInfoForUser(req.query.userId);
    if (userInfo) {
      var noteFilter = new Evernote.NoteFilter({
        order: Evernote.NoteSortOrder.UPDATE_SEQUENCE_NUMBER,
        inactive: false,
        ascending: false, // newest first
        words: ''
      });

      var resultSpec = new Evernote.NotesMetadataResultSpec({
        includeTitle: true,
        includeTagGuids: true,
        includeNotebookGuid: true
      });

      var client = new Evernote.Client({
        token: userInfo.oauthAccessToken,
        sandbox: config.SANDBOX
      });
      // TODO(2): Store this information in a custom UserInfo object
      var promisifiedNoteStoreClient =
        Promisifier.promisifyObject(client.getNoteStore());

      var findNotesMetadataPromise =
        promisifiedNoteStoreClient.findNotesMetadata(
          userInfo.oauthAccessToken, noteFilter, 0, 100, resultSpec
        );
      findNotesMetadataPromise.then(function(noteList) {
        console.log(noteList.notes);

        if (noteList.notes.length) {
          // Make a list of links to fake various webhook actions
          var fakeWebhookLinkList =
            noteList.notes.reduce(function(partialList, note, idx) {
                var baseNbUrl = '/hook?userId=' + req.query.userId
                  + '&notebookGuid=' + note.notebookGuid;
                var baseUrl = baseNbUrl + '&guid=' + note.guid;
                var updateNbLink = '<a href="' + baseNbUrl
                  + '&reason=notebook_update">notebook_update</a> | ';
                var updateLink = '<a href="' + baseUrl + '&reason=update">update</a> | ';
                var createLink = '<a href="' + baseUrl + '&reason=create">create</a> | ';
                var bizUpdateLink = '<a href="' + baseUrl
                  + '&reason=business_update">business_update</a> | ';
                return partialList + ('<div>' + note.title + ': '
                  + updateNbLink + updateLink + createLink + bizUpdateLink + '</div>');
              }, '');

          res.send(fakeWebhookLinkList);
        } else {
          res.send('No notes found!');
        }
      }, function(error) {
        errorLogger(res, error);
      });

      return;
    }
  }
  res.send('User not found. <a href="/OAuth">Try OAuth</a>');
});

/**
 * Begins the OAuth process. Based on
 * https://github.com/evernote/evernote-sdk-js/blob/master/sample/express/routes/index.js
 */
app.get('/OAuth', function(req, res) {
  console.log('/OAuth');
  var client = new Evernote.Client({
    consumerKey: config.API_CONSUMER_KEY,
    consumerSecret: config.API_CONSUMER_SECRET,
    sandbox: config.SANDBOX
  });

  client.getRequestToken(oauthCallbackUrl,
    function(error, oauthRequestToken, oauthRequestTokenSecret, results){
      if (error) {
        return errorLogger(res, error);
      } else {
        // store the tokens in the session
        req.session.oauthRequestToken = oauthRequestToken;
        req.session.oauthRequestTokenSecret = oauthRequestTokenSecret;

        // redirect the user to authorize the token
        res.redirect(client.getAuthorizeUrl(oauthRequestToken));
      }
    }
  );
});

/**
 * Once we have an OAuth request token, we
 */
app.get('/OAuthCallback', function(req, res) {
  console.log('/OAuthCallback');
  var client = new Evernote.Client({
    consumerKey: config.API_CONSUMER_KEY,
    consumerSecret: config.API_CONSUMER_SECRET,
    sandbox: config.SANDBOX
  });

  client.getAccessToken(
    req.session.oauthRequestToken,
    req.session.oauthRequestTokenSecret,
    req.query['oauth_verifier'],
    function(error, oauthAccessToken, oauthAccessTokenSecret, results) {
      if (error) {
        return errorLogger(res, error, '/error');
      } else {
        // store the access token in the session
        usersMap.addUser(results.edam_userId, oauthAccessToken, oauthAccessTokenSecret,
          results.edam_expires);
        usersMap.setShardForUser(results.edam_userId, results.edam_shard);
        usersMap.setNoteStoreUrlForUser(results.edam_userId, results.edam_noteStoreUrl);
        usersMap.setWebApiUrlPrefixForUser(results.edam_userId,
          results.edam_webApiUrlPrefix);

        req.session.oauthDone = true;
        req.session.userId = results.edam_userId;
        res.redirect('/OAuthDone');
      }
    }
  );
});

app.get('/OAuthDone', function(req, res) {
  console.log('/OAuthDone: ' + req.session.oauthDone);
  if (req.session.oauthDone) {
    res.send('OAuth complete! <a href="/listNotes?userId=' + req.session.userId + '">List notes</a>');
  } else {
    res.send('Error with OAuth; check the logs.');
  }
});

// Start the server on port 3000 or the server port.
var port = process.env.PORT || 3000;
console.log('PORT: ' + port);
var server = app.listen(port);
