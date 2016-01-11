/*
 * Evernote-webhooks: A project to use webhooks to automate things in Evernote
 */
// a very simple node server using the express module
var express = require("express");
var app = express();
var wwwDir = "/www";
app.use("/", express.static(__dirname + wwwDir));
app.get("/", function(req, res) { res.render(wwwDir + "/index.html");});
// Start the server on port 3000 or the server port.
var port = process.env.PORT || 3000;
console.log("PORT: " + port);
var server = app.listen(port);
