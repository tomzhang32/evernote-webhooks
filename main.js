/*
 * Evernote-webhooks: A project to use webhooks to automate things in Evernote
 */
var express = require('express');
var Evernote = require('evernote').Evernote;
var expressSession = require('express-session');
var UsersMap = require('./UsersMap');

var config;
try {
  config = require('./config.json');
} catch (e) {
  config = {};
}

config.API_CONSUMER_KEY = config.API_CONSUMER_KEY || process.env.consumerKey;
config.API_CONSUMER_SECRET = config.API_CONSUMER_SECRET || process.env.consumerSecret;
config.SANDBOX = config.SANDBOX || true;
config.SERVICE_BASE = config.SERVICE_BASE || process.env.serviceBase;
config.TARGET_TAG_NAME = 'toc';

var oauthCallbackUrl = config.SERVICE_BASE + '/OAuthCallback';

var usersMap = new UsersMap();
var history = [];

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
 * https://dev.evernote.com/doc/articles/polling_notification.php
 * Logs the query to the history array
 * For our purposes, we only care about responding to note update events.
 */
app.get('/hook', function(req, res) {
  console.log('/hook');
  history.push(req.query);
  if (req.query && req.query.userId && req.query.guid
    && (req.query.reason === 'update' || req.query.reason === 'business_update')) {
    // TODO: Do we really need to check the reason? Is just having the guid enough?
    //   (ie, in case a client adds a note with a tag)
    // Retrieve the note name stored in session if we have saved it
    // TODO: Delete this when we don't need to fake our hooks
    var noteTitle = '';
    if (req.query.guid === req.session.noteGuid) {
      noteTitle = req.session.noteTitle;
    }

    // Look up this userID and get note info for this note
    var userInfo = usersMap.getInfoForUser(req.query.userId);
    if (userInfo && userInfo.oauthAccessToken) {
      var client = new Evernote.Client({
        token: userInfo.oauthAccessToken,
        sandbox: config.SANDBOX
      });
      var noteStoreClient = client.getNoteStore();
      noteStoreClient.getNoteTagNames(userInfo.oauthAccessToken, req.query.guid,
        function(error, tagNames) {
          if (error) {
            errorLogger(res, error);
            return;
          } else {
            // Try to find the target tag in the tags of this note.
            var upperCaseTagNames = tagNames.map(function(a) { return a.toUpperCase(); });
            if (upperCaseTagNames.indexOf(config.TARGET_TAG_NAME.toUpperCase()) > -1) {
              res.send('Note ' + noteTitle + ' has tag!');
              // TODO: Do some automation here!
            } else {
              res.send('Note ' + (noteTitle ? noteTitle : req.query.guid) +
                ' does not have tag ' + config.TARGET_TAG_NAME);
            }
          }
        }
      );
    }
  } else {
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
 * Logs some notes in case we want to inspect the details
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
        includeNotebookGuid: true,
        includeDeleted: true,
        includeAttributes: true
      });

      var client = new Evernote.Client({
        token: userInfo.oauthAccessToken,
        sandbox: config.SANDBOX
      });
      var noteStoreClient = client.getNoteStore();
      noteStoreClient.findNotesMetadata(userInfo.oauthAccessToken, noteFilter, 0, 100,
        resultSpec, function(error, noteList) {
          if (error) {
            errorLogger(res, error);
            return;
          }
          console.log(noteList.notes);

          if (noteList.notes.length) {
            response = '';
            response += noteList.notes.length + ' notes found<br>';
            response += 'first note:<br>';
            response += 'guid: ' + noteList.notes[0].guid + '<br>';
            response += 'title: ' + noteList.notes[0].title + '<br>';
            response += 'notebookGuid: ' + noteList.notes[0].notebookGuid + '<br>';
            response += 'tagGuids: ' + noteList.notes[0].tagGuids + '<br>';
            response += '<a href="/hook?userId=' + req.query.userId + '&guid='
              + noteList.notes[0].guid + '&notebookGuid=' + noteList.notes[0].notebookGuid
              + '&reason=update">"update" this note</a>';

            // Add the guid and note name to this session in case the user clicks the link.
            // TODO: Delete this when we don't need to fake our hooks
            req.session.noteGuid = noteList.notes[0].guid;
            req.session.noteTitle = noteList.notes[0].title;
            res.send(response);
          } else {
            res.send('No notes found!');
          }
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
        errorLogger(res, error);
        return;
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
        errorLogger(res, error, '/error');
        return;
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
