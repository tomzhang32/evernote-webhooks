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
  config = {
    API_CONSUMER_KEY: process.env.consumerKey,
    API_CONSUMER_SECRET: process.env.consumerSecret,
    SANDBOX: true
  };
}

var app = express();
var wwwDir = "/www";

app.use(expressSession({
  resave: false,
  saveUninitialized: false,
  secret: 'this is a secret'
}));
app.use('/', express.static(__dirname + wwwDir));

app.get('/OAuth', function(req, res) {
  var client = new Evernote.Client({
    consumerKey: config.API_CONSUMER_KEY,
    consumerSecret: config.API_CONSUMER_SECRET,
    sandbox: config.SANDBOX
  });
  console.log(req.session);

  client.getRequestToken('/OAuthCallback', function(error, oauthToken, oauthTokenSecret, results){
    if (error) {
      console.log(JSON.stringify(error));
      res.send(error.data);
    } else { 
      // store the tokens in the session
      req.session.hasRequestToken = true;
      req.session.oauthToken = oauthToken;
      req.session.oauthTokenSecret = oauthTokenSecret;

      // redirect the user to authorize the token
      res.redirect(client.getAuthorizeUrl(oauthToken));
    }
  });
});

app.get('/OAuthCallback', function(req, res) {
  var client = new Evernote.Client({
    consumerKey: config.API_CONSUMER_KEY,
    consumerSecret: config.API_CONSUMER_SECRET,
    sandbox: config.SANDBOX
  });
  console.log(req.session);

  client.getAccessToken(
    req.session.oauthToken,
    req.session.oauthTokenSecret,
    req.param('oauth_verifier'),
    function(error, oauthAccessToken, oauthAccessTokenSecret, results) {
      if(error) {
        console.log('error');
        console.log(error);
        res.redirect('/');
      } else {
        // store the access token in the session
        req.session.oauthAccessToken = oauthAccessToken;
        req.session.oauthAccessTtokenSecret = oauthAccessTokenSecret;
        req.session.edamShard = results.edam_shard;
        req.session.edamUserId = results.edam_userId;
        req.session.edamExpires = results.edam_expires;
        req.session.edamNoteStoreUrl = results.edam_noteStoreUrl;
        req.session.edamWebApiUrlPrefix = results.edam_webApiUrlPrefix;
        res.redirect('/');
      }
    }
  );
});

app.get('/', function(req, res) { res.render(wwwDir + '/index.html');});

// Start the server on port 3000 or the server port.
var port = process.env.PORT || 3000;
console.log('PORT: ' + port);
var server = app.listen(port);
