# evernote-webhooks
Using webhooks in Evernote to do things

## How to use it
Once installed, run `npm install && npm start` to start the server. By default, the server listens on port 3000, though you can override it by setting the environment variable `PORT` to the desired port number.
To test locally:

1. Create or have an account at sandbox.evernote.com
2. Get an API key and secret from https://dev.evernote.com/
3. Add your API key and secret to `config.json`
4. Start the server: `npm install && npm start`
5. Visit http://localhost:3000/ and follow the prompts to log in to your sandbox account
6. Visit http://localhost:3000/hook/ with the params as specified in this article: https://dev.evernote.com/doc/articles/polling_notification.php#webhooks, to simulate a webhook request.
7. (Optional) If you have a static IP for your server, you can register a webhook for your API key at https://dev.evernote.com/support/


##### Summary of pages
* `/` The home page. Click the link to begin the OAuth process
* `/error` A simple error page.
* `/hook` The endpoint to which webhook requests should be sent.
* `/history` Lists all the requests to `/hook` since the server started.
* `/listNotes` Logs the user's notes metadata to the console and displays the most recently updated note to the user
* `/OAuth` begins the OAuth flow by fetching a temporary request token and forwarding you to the Evernote OAuth authorization page.
* `/OAuthCallback` is where the user lands after the OAuth attempt. If there was an error, they are forwarded to `/error`. Otherwise, the user ID, OAuth access token, and other auxiliary data is saved and the user forwarded to `/OAuthDone`.
* `/OAuthDone` is just a confirmation that the OAuth process is complete and the user information has been saved.

##### Status
* I built this for Evernote's first hack week. Right now, it's missing a database for storing user's credentials, and only supports generating a table of contents in a notebook.
* To generate a table of contents, add the "toc" tag to any note in a notebook in your account (assuming you've logged in to the app already) - every time something changes in your account, the webhook you registered is called. Then, if it's an "update" event and the note has the "toc" tag (or previously had the "toc" tag), the server finds all notes in the same notebook with that "toc" tag and regenerates the table of contents from those notes.
  * Limitations:
  * This regenerates the table of contents every time, so will blow away any changes the user made to the table of contents. I'm not sure how to get around this. For example, if the user adds headers to separate the links, how can we determine which notes should go in each section?. One solution is to use a special element, like an `<li>`, to denote "blocks" of content that can be shuffled around. The concern here is making sure these groupings into "blocks" are preserved by the Evernote note editor.
* Other features that leverage the web hooks have not been implemented.
