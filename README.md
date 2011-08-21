# node-superupload - HTML file upload system with progress reporting #

I've written this file upload system as a programming exercise.  It is
meant to be well written and minimal, and does not try to be a real
application.  In fact, it does not do anything useful but demonstrates
how file upload progress reporting can be done in the context of a web
server implemented with node.js.

## General architecture ##

Following the requirements of the programming challenge, I have tried
to make the implementation minimal while completely meeting the
requirements.  I have not used any existing web framework, so session
management, request routing and static file handling is included in
the application code.  I have implemented only those parts of a web
framework that are actually needed to implement the desired
functionality.

The progress reporting works as follows: On the upload page, a file
selector exists, which is polled periodically to determine whether the
user has chosen a file.  No DOM event is issued for this, so polling
the input element is the only way to determine whether a file has been
selected.  The file selector lives in a separate &lt;form&gt; element that
has an iframe as its target and submits to the `/upload` URL.

Once a file has been selected, the file selection input element is
replaced by a progress report element and an asynchronous JSON request
for the `/status` URL is started.  The `/status` request creates a
fresh session with the server and then programmatically submits the
upload form, starting the actual upload.  Then, further status
requests are periodically initiated to monitor the upload progress.

The status report sent by the server consists of the current progress,
expressed as a value from 0 to 1, and an object describing the
uploaded file once the upload is complete.  The status handler sleeps
a while before responding to the request so that not too much
bandwidth is wasted by the status reports.

The callback for the status data updates the progress display or, when
the upload is complete, replaces the progress report with the name of
the uploaded file.  At upload completion, the callback starts an
interval timer that polls the contents of the `description` text area
to see whether the user has entered a description.  Once a description
has been entered by the user, the `Save` button is enabled.

The `Save` button submits a second form that consists of the
`description` textarea and the `Save` button.  The form is handled by
the `/save` handler which displays the name of the uploaded file as it
was on the client, the pathname on the server's file system and the
description entered by the user.  It offers a link that allows
downloading of the uploaded file, and another link that leads back to
the upload page.

## Testing ##

Part of the requirements was that the upload system should work with
IE>6, Firefox and Chrome.  I have tested it with IE9, Firefox 3.5.7
and Chrome as of Aug-2011.  I have not tried IE7 or IE8 as I don't
have either of that installed on my box.  I have not written automated
system or unit tests.

## File and directory structure ##

`server.js` contains the server code, it is started with `node
server.js`.  The server listens to port 8099 by default.  A different
port can be specified as a command line argument.  If port 80 should
be used, the server must run with suitable operating system
privileges.

`static/index.html` contains the file upload page.

`static/javascript.js` implements the client side functionality.

## Dependencies ##

As this was for a programming exercise, the number of external
dependencies has been kept low.  The following libraries are used:

### [node.js](http://nodejs.org/) ###

Node.js is a programming environment based on Google's V8 JavaScript
engine.  It adds asynchronous I/O to JavaScript and is used to
implement the server side of the file upload system.  Node.js is not
included in my github repository and must be installed seperately.

### [formidable](https://github.com/felixge/node-formidable) ###

Uploads are sent as multipart/form-data request bodies to the web
server.  Parsing multipart MIME messages is not hard, but it is also
not particularily exciting to do that.  A robust implementation would
have compromised a large part of this demo application, so I decided
to use formidable instead, which adds a multipart/form-data parser to
node.js.  It is included in the `node_modules/` directory.

### [jQuery](http://jquery.com/) ###

The client side of the application needs to traverse the DOM and issue
asynchronous HTTP requests to the server.  Nobody wants to read code
that does this using standard DOM calls and deals with browser
incompatibilities, so I chose jQuery for the task.  It is included in
the file `static/jquery-1.6.2.min.js`.

# In production code, I would... #

Here are some limitations of my application:

In this application, the uploaded file can be downloaded only from the
session that uploaded it.  Obviously, in a real system, uploads would
not be deleted when the session dies, but would be stored and made
accessible for a longer timespan.

In production code, I would not want to make basic web framework
functionality be part of the application code.  The session handling
that I have implemented, even though it is sufficient for this
application, is not very robust and has no guards against session
hijacking.  Also, the session list is periodically polled for idle
sessions, which does not scale well.

The CSS usage is not very modular and the selectors are not specific.
In production code, one would make sure that the only the upload
system's DOM element are addressed by the CSS and the jQuery selectors
so that the web page can contain other, independent components.

No automated tests are present.  In a real-world application, both
unit level test for the framework parts of the code as well as
system-level tests would be useful.  The system-level tests would need
to use the supported browsers to execute the whole application click
by click.

The mechanism that manages the prompt string in the "description" text
area could be a bit nicer (i.e. be implemented as jQuery plugin).

