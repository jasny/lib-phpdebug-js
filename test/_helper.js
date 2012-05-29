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
 *   Test helper that must run before any test is executed.
 *   
 *   Parses `node ./test/all --port 9080 --php lib-phpdebug.localhost` command line arguments
 *   and ensures the debug proxy server and php server for `../php/` are running.
 *
 *   If the debug proxy server is not running it is started at the beginning of the first test
 *   in the first test suite and shut down after the last test in the last test suite.
 *
 * External Dependencies:
 * 
 *   * `CLI` <- `npm install cli` -> [https://github.com/chriso/cli](https://github.com/chriso/cli)
 *   * `Q` <- `npm install q` -> [http://github.com/kriskowal/q](http://github.com/kriskowal/q)
 *   * `SOCKET_IO_CLIENT` <- `npm install socket.io-client` -> [https://github.com/learnboost/socket.io-client](https://github.com/learnboost/socket.io-client)
 *   * `XML2JS` <- `npm install xml2js` -> [https://github.com/Leonidas-from-XIV/node-xml2js/](https://github.com/Leonidas-from-XIV/node-xml2js/)
 *
 */
const PROXY_PORT = 9080, PHP_VHOST = "lib-phpdebug.localhost", XDEBUG_PORT = 9000, TEST_TIMEOUT = 5000;

//TEMPORARY: http://stackoverflow.com/questions/5919629/express-module-not-found-when-installed-with-npm
//Set NODE_PATH in your environment instead (https://github.com/unconed/TermKit/issues/68)
//require.paths.push('/usr/local/lib/node_modules');

var CLI = require("cli"),
    Q = require("q"),
    HTTP = require("http"),
    PATH = require("path"),
    EXEC = require("child_process").exec,
    SYS = require("sys"),
    UTIL = require('util'),
    ASSERT = require("assert"),
    SOCKET_IO_CLIENT = require("socket.io-client"),
    XML2JS = require("xml2js"),
    NET = require("net");


var serverInfo = {},
    serverChildInstance = null,
    ourServer = false;  // if we started the debug proxy server


exports.getTestTimeout = function(extra) {
    return TEST_TIMEOUT + (extra || 0);
};

exports.getXdebugPort = function() {
    return XDEBUG_PORT;
};

exports.getAPI = function() {
    return {
        NET: NET,
        XML2JS: XML2JS
    };
};

exports.getSocketIO = function() {
    return SOCKET_IO_CLIENT;
};

exports.getSocketIOPort = function() {
    return serverInfo.port;
};

exports.getXdebugClientOptions = function() {
    return {
        API: exports.getAPI(),
        socketIO: exports.getSocketIO(),
        socketIOPort: exports.getSocketIOPort()
    };
};

exports.debugScript = function(name, sessionName)
{
    EXEC([
        // export XDEBUG_CONFIG="idekey=,session=SESSION"
        // export XDEBUG_CONFIG="idekey=IDEKEY,session=SESSION"
        'export XDEBUG_CONFIG="' + 'idekey=' + ((serverInfo.idekey)?serverInfo.idekey:'') + ',session=' + sessionName + '";',
        "php " + PATH.dirname(PATH.dirname(module.id)) + "/php/scripts/" + name + ".php"
    ].join(" "), function (error, stdout, stderr) {
        if (serverInfo.verbose)
            console.log("[debugScript][stdout] " + stdout);
        if (stderr)
            console.log("[debugScript][stderr] " + stderr);
    });
}

exports.ready = function(callback) {
    // See: https://github.com/chriso/cli/blob/master/examples/static.js
    CLI.parse({
        verbose:  ["v", 'Log major events to console', 'boolean', false],
        port:  [false, 'Listen on this port', 'number', PROXY_PORT],
        php: [false, 'Hostname for `../php/`', 'string', PHP_VHOST],
        'skip-browser-tests': [false, 'Skip browser tests?', 'boolean', false],
        'idekey': [false, 'Secret IDE key (xdebug.idekey)', 'string', null]
    });
    CLI.main(function(args, options) {
        serverInfo = options;
        // Test connection to debug proxy server. If not running we start it.
        Q.when(testConnection(), function ok() {
            callback();
        }, function error() {
            Q.when(startServer(), function ok() {
                callback();
            }, function error(e) {
                fatalExit("Error starting debug proxy server: " + e);
            });
        });
    });
};

exports.done = function(callback)
{
    stopServer(callback);
}

exports.fatalExit = function fatalExit(message) {
    UTIL.debug("Error: " + message + "\n");
    process.exit(1);
};

exports.runBrowserTest = function(test, callback, timeout) {
    // If we started the proxy server we assume no browser client is connected
    // so we cannot run the browser tests. To run the browser tests start the proxy server
    // manually, open the example client in the browser and run tests from the browser.
    // TODO: Ask the proxy server if a client is connected
    if (ourServer || serverInfo['skip-browser-tests']) {
        console.log("[runBrowserTest] Skip: " + test);
        // Assume all browser tests passed
        callback();
        return;
    }
    Q.when(runBrowserTest(test, timeout), callback, function(e) {
        console.log("[runBrowserTest] ERROR: " + e);
        // NOTE: This will throw and thus stop test suite from continuing
        ASSERT.fail(false, true, "" + e);
    });
};

function testConnection() {
    var result = Q.defer();
    HTTP.get({
        host: "localhost",
        port: serverInfo.port,
        path: '/alive'
    }, result.resolve).on('error', result.reject);
    setTimeout(function() {
        // If no success or error response within 1 second we assume server is not running
        if (!Q.isResolved(result.promise) && !Q.isRejected(result.promise)) {
            result.reject("Error calling `http://localhost:" + serverInfo.port + "/alive`");
        }
    }, 1000);
    return result.promise;
}

function stopServer(callback) {
    if (serverChildInstance===null)
    {
        callback();
        return;
    }
    serverChildInstance.on("exit", function()
    {
        callback();
    });
    serverChildInstance.kill();
}

function startServer() {
    var result = Q.defer();
    ourServer = true;
    var command = "node " + PATH.normalize(__dirname + "/../example/server --test --idekey " + serverInfo.idekey + " --port " + serverInfo.port + " --php " + serverInfo.php);
    console.log("Starting proxy server: " + command);

    serverChildInstance = EXEC(command, function (error, stdout, stderr)
    {
        if (serverInfo.verbose)
            console.error("[proxyServer] " + stdout.split("\n").join("\n[proxyServer] ") + "\n");
    });

    // Give server 500ms to start up
    var counter = 0;
    var intervalID = setInterval(function() {
        counter++;
        Q.when(testConnection(), function ok() {
            clearInterval(intervalID);
            result.resolve();
        }, function fail() {
            if (counter > 5) {
                clearInterval(intervalID);
                result.reject();
            }
        });
    }, 500);

    function ping() {
        HTTP.get({
            host: "localhost",
            port: serverInfo.port,
            path: '/ping'
        });
    }
    // Ping server for as long as the test script runs
    var pingIntervalID = null;
    Q.when(result.promise, function()
    {
        ping();
        pingIntervalID = setInterval(ping, 300);
    });

    serverChildInstance.on("exit", function()
    {
        if (pingIntervalID!==null)
            clearInterval(pingIntervalID);
        serverChildInstance = null;
    });
    return result.promise;
}

function runBrowserTest(test, timeout) {
    var result = Q.defer();
    // Make a connection to the debug proxy server to run a test in the browser
    // Expect {success:true} or {error:"message"} as response
    HTTP.get({
        host: "localhost",
        port: serverInfo.port,
        path: "/run-browser-test?test=" + test + "&timeout=" + timeout
    }, function(res) {
        if (res.statusCode !== 200) {
            result.reject("Error 'status: " + res.statusCode + "' calling `http://localhost:" + serverInfo.port + "/run-browser-test`");
            return;
        }
        var data = [];
        res.on('data', function(chunk) {
            data.push(chunk);
        });
        res.on('end', function() {
            var response;
            try {
                response = JSON.parse(data.join(""));
                if (!response) throw new Error("Response not a valid JSON structure!");
            }
            catch (e) {
                result.reject("Error '" + e + "' calling `http://localhost:" + serverInfo.port + "/run-browser-test`");
                return;
            }
            if (response.success) {
                result.resolve();
            }
            else {
                result.reject(response.error);
            }
        });
    }).on('error', function(e) {
        result.reject("Error '" + e + "' calling `http://localhost:" + serverInfo.port + "/run-browser-test`");
    });
    return result.promise;
}
