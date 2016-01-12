/*
 * Evernote-webhooks: A project to use webhooks to automate things in Evernote
 */
// a very simple node server using the express module
var express = require("express");
var app = express();
var wwwDir = "/www";
var port = process.env.PORT || 3000;
console.log("PORT: " + port);
var server = app.listen(port);
var consumerKey = process.env.consumerKey;
var consumerSecret = process.env.consumerSecret;

app.use("/", express.static(__dirname + wwwDir));
app.get("/", function(req, res) { res.render(wwwDir + "/index.html?consumerKey" + consumerKey);});
// Start the server on port 3000 or the server port.
