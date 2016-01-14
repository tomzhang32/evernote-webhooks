# evernote-webhooks
Using webhooks in Evernote to do things

## How to use it
Once installed, run `npm install && npm start` to start the server. By default, the server listens on port 3000, though you can override it by setting the environment variable `PORT` to the desired port number.
##### Summary of pages
* `/` The home page. Click the link to begin the OAuth process
* `/error` A simple error page.
* `/hook` The endpoint to which webhook requests should be sent.
* `/history` Lists all the requests to `/hook` since the server started.
* `/listNotes` Logs the user's notes metadata to the console and displays the most recently updated note to the user
* `/OAuth` begins the OAuth flow by fetching a temporary request token and forwarding you to the Evernote OAuth authorization page.
* `/OAuthCallback` is where the user lands after the OAuth attempt. If there was an error, they are forwarded to `/error`. Otherwise, the user ID, OAuth access token, and other auxiliary data is saved and the user forwarded to `/OAuthDone`.
* `/OAuthDone` is just a confirmation that the OAuth process is complete and the user information has been saved.
