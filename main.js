/*
 * Evernote-webhooks: A project to use webhooks to automate things in Evernote
 */
var express = require('express');

var app = express();
var consumerKey = process.env.consumerKey;
var consumerSecret = process.env.consumerSecret;
var wwwDir = "/www";

app.use('/', express.static(__dirname + wwwDir));
app.get('/:endpoint', function(req, res, next) {
  console.log(req.params.endpoint);
  if (req.params.endpoint === 'consumerKey') {
    res.send(consumerKey);
  } else {
    res.send(req.params.endpoint + ' endpoint reached');
  }
  next();
});
app.get('/', function(req, res) { res.render(wwwDir + '/index.html');});

// Start the server on port 3000 or the server port.
var port = process.env.PORT || 3000;
console.log('PORT: ' + port);
var server = app.listen(port);
