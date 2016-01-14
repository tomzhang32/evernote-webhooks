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

var oauthCallbackUrl = config.SERVICE_BASE + '/OAuthCallback';

var usersMap = new UsersMap();
var history = [];
var resultSpec = new Evernote.NotesMetadataResultSpec({
  includeTitle: true,
  includeNotebookGuid: true,
  includeDeleted: true,
  includeAttributes: true
});

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
  res.send(req.query);
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
        inactive: false,
        ascending: false, // newest first
        words: ''
      });

      var client = new Evernote.Client({
        token: userInfo.oauthAccessToken,
        sandbox: config.SANDBOX
      });
      var noteStoreClient = client.getNoteStore();
      noteStoreClient.findNotesMetadata(userInfo.oauthAccessToken, noteFilter, 0, 100, resultSpec,
        function(err, noteList) {
          if (err) {
            console.log(err);
            res.send(JSON.stringify(err));
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
        console.log(JSON.stringify(error));
        res.send(error.data);
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
        console.log('error');
        console.log(error);
        res.redirect('/error');
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
