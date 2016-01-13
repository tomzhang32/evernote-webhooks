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

app.get('/hook', function(req, res) {
  console.log('/hook');
  console.log(req.query);
  res.send(req.query);
});

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
        res.redirect('/OAuthDone');
      }
    }
  );
});

app.get('/OAuthDone', function(req, res) {
  console.log('/OAuthDone: ' + req.session.oauthDone);
  if (req.session.oauthDone) {
    res.send('OAuth complete!');
  } else {
    res.send('Error with OAuth; check the logs.');
  }
});

// Start the server on port 3000 or the server port.
var port = process.env.PORT || 3000;
console.log('PORT: ' + port);
var server = app.listen(port);
