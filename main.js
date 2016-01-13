/*
 * Evernote-webhooks: A project to use webhooks to automate things in Evernote
 */
var express = require('express');
var Evernote = require('evernote').Evernote;
var expressSession = require('express-session');
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
        // TODO: Store the access token somewhere else
        req.session.oauthAccessToken = oauthAccessToken;
        req.session.oauthAccessTtokenSecret = oauthAccessTokenSecret;
        req.session.edamShard = results.edam_shard;
        req.session.edamUserId = results.edam_userId;
        req.session.edamExpires = results.edam_expires;
        req.session.edamNoteStoreUrl = results.edam_noteStoreUrl;
        req.session.edamWebApiUrlPrefix = results.edam_webApiUrlPrefix;
        res.redirect('/OAuthDone');
      }
    }
  );
});

app.get('/OAuthDone', function(req, res) {
  console.log('/OAuthDone');
  console.log(req.session);
  res.send('OAuth complete!');
});

// Start the server on port 3000 or the server port.
var port = process.env.PORT || 3000;
console.log('PORT: ' + port);
var server = app.listen(port);
