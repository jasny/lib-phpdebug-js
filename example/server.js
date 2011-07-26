/**
 * Package: https://github.com/ajaxorg/lib-phpdebug
 * 
 * License: MIT
 * 
 * Copyright(c) 2011 Ajax.org B.V. <info AT ajax DOT org>
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 * 
 * Author: Christoph Dorn <christoph@christophdorn.com> (http://www.christophdorn.com/)
 * 
 * Purpose of this module:
 * 
 *   Example server showing how to integrate the `../lib/xdebug` module into a
 *   [connect](https://github.com/senchalabs/connect) + 
 *   [socket.io](https://github.com/learnboost/socket.io) based stack.
 *
 * External Dependencies:
 * 
 *   * `Q` <- `npm install q` -> [http://github.com/kriskowal/q](http://github.com/kriskowal/q)
 *   * `CLI` <- `npm install cli` -> [https://github.com/chriso/cli](https://github.com/chriso/cli)
 *   * `CONNECT` <- `npm install connect` -> [https://github.com/senchalabs/connect](https://github.com/senchalabs/connect)
 *   * `CONNECT_DISPATCH` <- `../support/dispatch` -> [https://github.com/caolan/dispatch](https://github.com/caolan/dispatch)
 *   * `SOCKET_IO` <- `npm install socket.io` -> [https://github.com/learnboost/socket.io](https://github.com/learnboost/socket.io)
 *   * `XML2JS` <- `npm install xml2js` -> [https://github.com/Leonidas-from-XIV/node-xml2js/](https://github.com/Leonidas-from-XIV/node-xml2js/)
 *   
 */

const XDEBUG_PORT = 9000,
      PROXY_PORT = 9080,
      PHP_VHOST = "lib-phpdebug.localhost";


var SYS = require("sys"),
    CLI = require("cli"),
    Q = require("q"),
    PATH = require("path"),
    QS = require("querystring"),
    CONNECT = require("connect"),
    CONNECT_DISPATCH = require("../support/dispatch"),
    SOCKET_IO = require("socket.io"),
    XDEBUG = require("../lib/xdebug"),
    XDEBUG_PROXY = require("../lib/proxy"),
    EXEC = require('child_process').exec,
    NET = require("net"),
    XML2JS = require("xml2js");


var proxyServer = null,
    browserTestClients = [],
    browserTestIndex = 0,
    runningBrowserTests = {};


// See: https://github.com/chriso/cli/blob/master/examples/static.js
CLI.parse({
    port:  [false, 'Listen on this port', 'number', PROXY_PORT],
    php: [false, 'Hostname for `../php/`', 'string', PHP_VHOST]
});

CLI.main(function(args, options)
{
    startServer(options);
});


function startServer(options)
{
    var app = CONNECT.createServer(

        CONNECT_DISPATCH({

            // Check if the server is running
            "/alive": function(req, res) {
                res.end("OK");
            },

            // Stop the server
            "/stop": function(req, res) {
                res.end("OK");
                process.exit(0);
            },

            // Run a browser client test. If no browser client connected
            // simulate a browser client by connecting one internally
            // for the duration of this test.
            "/run-browser-test": function(req, res) {
                try {
                    Q.when(runBrowserTest(QS.parse(req.url.replace(/^[^\?]*\?/, "")).test), function() {
                        res.end(JSON.stringify({
                            success: true
                        }));
                    }, function(e) {
                        res.end(JSON.stringify({
                            error: ""+e
                        }));
                    });
                } catch(e) {
                    res.end(JSON.stringify({
                        error: ""+e
                    }));
                }
            },

            "/.*": CONNECT.static(__dirname + '/client', { maxAge: 0 })
        })
    );

    var io = SOCKET_IO.listen(app);

    // Initialize and hook in the debug proxy server so it can
    // communicate via `socket.io`.

    proxyServer = new XDEBUG_PROXY.Server();

    proxyServer.listen(new XDEBUG.Client({
        API: {
            NET: NET,
            XML2JS: XML2JS
        },
        xdebugPort: XDEBUG_PORT
    }));

    proxyServer.hook({
        socketIO: io
    });

    // Hook in browser test system
    io.of("/test").on("connection", function(socket)
    {
        browserTestClients.push(socket);
        socket.on("disconnect", function()
        {
            for (var i=browserTestClients.length-1 ; i >= 0 ; i-- ) {
                if (browserTestClients[i] === socket)
                    browserTestClients.splice(i, 1);
            }
        });
        socket.on("run-result", function(data)
        {
            if (!runningBrowserTests["i:" + data.testIndex])
                return;
            if (data.success) {
                runningBrowserTests["i:" + data.testIndex].resolve();
            } else
            if (data.error) {
                runningBrowserTests["i:" + data.testIndex].reject("Browser test failed: " + data.error);
            } else
                throw new Error("Message data does not contain 'success' or 'error' key!");
            delete runningBrowserTests["i:" + data.testIndex];
        });
        socket.on("run-tests", function(data)
        {
            var command = "node " +  PATH.normalize(__dirname + "/../test/all --port " + options.port + " --php " + options.php);
            EXEC(command, function (error, stdout, stderr)
            {
                SYS.puts("[proxyServer] " + stdout.split("\n").join("\n[proxyServer] ") + "\n");
            });
        });
        socket.emit("init", {
            phpHostname: options.php
        });
    }); 

    app.listen(options.port);

    SYS.puts("Launched Xdebug proxy server on port " + options.port + "\n");
}

function runBrowserTest(test)
{
    var result = Q.defer();
    
    // If a browser test client is connected we let it handle the test.
    // NOTE: The FIRST connected test client is always used to execute the test.
    if (browserTestClients.length > 0)
    {
        browserTestIndex++;
        runningBrowserTests["i:" + browserTestIndex] = result;
        browserTestClients[0].emit("run", { testIndex: browserTestIndex, test: test });
        setTimeout(function() {
            if (!Q.isResolved(result.promise) && !Q.isRejected(result.promise)) {
                delete runningBrowserTests["i:" + browserTestIndex];
                result.reject("Browser test took too long to finish!");
            }
        }, 2000);
    }
    // If no browser test client connected we simulate a fake one
    else
    {
        // Dynamically require the test module
        require(PATH.normalize(__dirname + "/../test/browser/" + test)).run(XDEBUG, {
            socketIO: proxyServer.fakeSocketClient()
        }, function(status)
        {
            if (status === true) {
                result.resolve();
            } else {
                result.reject(status);
            }
        });

        setTimeout(function() {
            if (!Q.isResolved(result.promise) && !Q.isRejected(result.promise)) {
                result.reject("Browser test took too long to finish!");
            }
        }, 2000);
    }

    return result.promise;
}
