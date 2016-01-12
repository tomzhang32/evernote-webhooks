/*
 * Evernote-webhooks: A project to use webhooks to automate things in Evernote
 */
var express = require('express');
var Evernote = require('evernote').Evernote;
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

// app.use(express.session());
app.use('/', express.static(__dirname + wwwDir));
app.get('/OAuth', function(req, res) {
  var client = new Evernote.Client({
    consumerKey: config.API_CONSUMER_KEY,
    consumerSecret: config.API_CONSUMER_SECRET,
    sandbox: config.SANDBOX
  });

  client.getRequestToken('/foo', function(error, oauthToken, oauthTokenSecret, results){
    if (error) {
      console.log(JSON.stringify(error));
      res.send(error.data);
    } else { 
      // store the tokens in the session
      req.session.oauthToken = oauthToken;
      req.session.oauthTokenSecret = oauthTokenSecret;

      // redirect the user to authorize the token
      res.redirect(client.getAuthorizeUrl(oauthToken));
    }
  });
});

app.get('/', function(req, res) { res.render(wwwDir + '/index.html');});

// Start the server on port 3000 or the server port.
var port = process.env.PORT || 3000;
console.log('PORT: ' + port);
var server = app.listen(port);
