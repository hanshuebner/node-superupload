// File upload server with progress reporting

var http = require('http');
var sys = require('sys');
var fs = require('fs');
var path = require('path');
var repl = require('repl');
var formidable = require('formidable');

// Configuration

var SESSION_EXPIRY_TIME = 600000;                              // number of milliseconds that a session may be idle before it is deleted
var SESSION_POLL_TIME = 10000;                                 // number of milliseconds between polls for idle sessions
var PROGRESS_DELAY = 500;                                      // number of milliseconds to delay responding to upload status requests
var PORT = process.argv[2] || 8099;                            // port to listen on for requests, may be specified on command line, default 8099

// Session handling

var sessions = {};

function expireSessions()
{
    var now = (new Date).getTime();
    for (var sessionId in sessions) {
        var session = sessions[sessionId];
        if ((now - session.lastUsed) > SESSION_EXPIRY_TIME) {
            console.log('deleting expired session', session);
            delete sessions[sessionId];
            if (session.upload) {
                fs.unlink(session.upload.path);
            }
        }
    }
}

setInterval(expireSessions, SESSION_POLL_TIME);

function makeSession()
{
    var now = (new Date).getTime();
    var sessionId = now + '.' + Math.random();
    var session = { id: sessionId, lastUsed: now };
    sessions[sessionId] = session;
    console.log('new session:', session);
    return session;
}

function getSession(request)
{
    var sessionId = undefined;
    if (request.headers['cookie']) {
        request.headers['cookie'].replace(/uploadSession=(.*)/, function (match, _sessionId) {
            sessionId = _sessionId;
        });
    }
    var session = sessionId && sessions[sessionId];
    if (session) {
        session.lastUsed = (new Date).getTime();
    }
    return session;
}

function createOrUpdateSession(request, response)
{
    request.session = getSession(request) || makeSession();
    response.setHeader('set-cookie', 'uploadSession=' + request.session.id);
}

// Static file handling

var contentTypes = {
    js: 'text/javascript',
    css: 'text/css',
    html: 'text/html'
};

function getFileContentType(filename)
{
    var extension;

    filename.replace(/\.([a-z]+)$/i, function (match, _extension) {
        extension = _extension.toLowerCase();
    });

    var contentType = contentTypes[extension] || "text/plain";

    if (contentType.match(/^text\//)) {
        contentType += '; charset=utf-8';
    }

    return contentType;
}

function streamFile(response, filename)
{
    var readStream = fs.ReadStream(filename);
    readStream.on('data', function (data) {
        response.write(data);
    });
    readStream.once('end', function () {
        readStream.removeAllListeners('data');
        response.end();
    });
}

function handleStaticFile(request, response)
{
    if (request.url.match(/\.\./)) {
        response.respond(403, 'illegal file name: ' + request.url);
    } else {
        var filename = path.join('static', (request.url == '/') ? 'index.html' : request.url);
        fs.stat(filename, function (err, stats) {
                if (err || !stats.isFile()) {
                    response.respond(404, 'file ' + filename + ' not found');
                } else if (request.headers['if-modified-since'] == stats.mtime.toUTCString()) {
                    response.respond(304);
                } else {
                    response.writeHead(200, { 'content-type': getFileContentType(filename),
                                              'last-modified': stats.mtime.toUTCString() });
                    streamFile(response, filename);
                }
            });
    }
}

// Upload form processing

function handleUpload(request, response)
{
    var form = new formidable.IncomingForm();
    form.uploadDir = "uploads/";
    form.on('progress', function (bytesReceived, bytesExpected) {
        request.session.progress = bytesReceived / bytesExpected;
    });
    form.parse(request, function(err, fields, files) {
        response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
        response.write('received upload:\n\n');
        response.end(sys.inspect(files.upload));
        var session = request.session;
        if (session.upload) {
            fs.unlink(session.upload.path);
        }
        session.upload = files.upload;
    });
}

// Handle upload status requests

function handleStatus(request, response)
{
    // Replies are delayed so that the client does not overload the server
    // with status requests.

    setTimeout(function () {
        response.respond(200,
                         { 'content-type': 'application/json' },
                         JSON.stringify({ progress: request.session.progress,
                                          upload: request.session.upload }));
    }, PROGRESS_DELAY);
}

// Trivial moustache like template expander - Expands variable
// references of the form {{foo.bar.baz}}

function trivialMoustacheExpand(template, vars)
{
    return template.replace(/{{(.*?)}}/g, function (match, variable) {
            try {
                var keys = variable.split(".");
                var object = vars[keys.shift()];
                while (keys.length && object) {
                    object = object[keys.shift()];
                }
                return object;
            }
            catch (e) {
                console.log('error expanding variable', variable, e);
                return variable;
            }
        });
}

// Handle "save" request, displaying the upload result to the user

function handleSave(request, response)
{
    var form = new formidable.IncomingForm();
    form.parse(request, function(err, fields, files) {
            fs.readFile('save.tmpl', 'utf-8', function (err, data) {
                    if (err) {
                        response.respond(500, err);
                    } else {
                        response.respond(200,
                                         { 'content-type': 'text/html; charset=utf-8' },
                                         trivialMoustacheExpand(data, { session: request.session, fields: fields }));
                    }
                });
    });
}

// Download a previously uploaded file

function handleDownload(request, response)
{
    var upload = request.session.upload;
    if (!upload) {
        response.respond(404, "No file uploaded");
        return;
    }
    response.writeHead(200, { 'content-type': upload.type,
                              'content-disposition': 'attachment; filename=' + upload.name });
    streamFile(response, upload.path);
}

// Create the actual web server and request router

var handlers = {
    "/upload": handleUpload,
    "/status": handleStatus,
    "/save": handleSave,
    "/download": handleDownload
};

http.createServer(function(request, response) {

    // In order to properly log requests, the writeHead() function of
    // the response object is intercepted and a 'log' event is created
    // when the handler writes the request status.

    response.realWriteHead = response.writeHead;
    response.writeHead = function (status, headers) {
        request.emit('log', status);
        this.realWriteHead(status, headers);
    };
    request.once('log', function (status) {
            console.log((new Date).toISOString(),
                        request.headers['x-forwarded-for'] || request.connection.remoteAddress,
                        request.method,
                        status,
                        request.url);
        });

    // Convenience function to write a response status and possibly a
    // message
    
    response.respond = function (status) {
        var headers = { 'content-type': 'text/plain; charset=utf-8' };
        var i = 1;
        if (typeof arguments[i] == 'object') {
            headers = arguments[i++];
        }
        this.writeHead(status, headers);
        for (; i < arguments.length; i++) {
            this.write(arguments[i].toString());
        }
        this.end();
    };

    // Dispatch the request - If no handler is defined for the
    // requested URL, attempt to serve static file.

    var handler = handlers[request.url];

    if (handler) {
        // Only dynamic handlers get sessions
        createOrUpdateSession(request, response);

        // Make sure that the browser never caches responses from
        // dynamic handlers (IE likes to)
        response.setHeader('cache-control', 'no-cache');
        response.setHeader('pragma', 'no-cache');
        response.setHeader('expires', '-1');
    } else {
        handler = handleStaticFile;
    }
    try {
        handler(request, response);
    }
    catch (e) {
        console.log('error handling request for', request.url, 'error', sys.inspect(e));
    }

}).listen(PORT);

console.log("\nsuperupload-server started, listening on port", PORT);

var r = repl.start('superupload-server> ');
r.context.sessions = sessions;
