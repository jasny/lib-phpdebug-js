
/**
 * Configure RequireJS
 */
require({
    packagePaths: {
        "packages": [
            "lib-phpdebug",
            {
                name: "lib-phpdebug-test",
                lib: "browser",
            }
        ]
    }
});


/**
 * Boot example client
 */
require([
    "lib-phpdebug/xdebug"
], function(XDEBUG)
{
    require.ready(function()
    {

        registerTestRunner();
        
        initUI(XDEBUG);
        
        initDefaultClient(XDEBUG);

    });
});


/**
 * Register a test runner that can be triggered from the proxy server
 * to run a specific test on the client and report back the result
 * to the server.
 */
function registerTestRunner()
{
    // Connect to the "test" socket.io namespace
    var phpHostname = false,
        socketIO = io,
        testSocket = socketIO.connect("http://localhost/test");
    testSocket.on("run", function (data) {
        try {
            // Load the requested test module and run it reporting result back to server
            require(["lib-phpdebug-test/" + data.test, "lib-phpdebug/xdebug"], function(testModule, XDEBUG) {
                try {
                    testModule.run(XDEBUG, {
                        socketIO: socketIO,
                        listenPort: 80,
                        helpers: {
                            debugScript: function(name, sessionName)
                            {
                                var url = "http://" + phpHostname + "/scripts/" + name + ".php?";
                                url += "XDEBUG_SESSION_START=" + sessionName;
                                url += "&t=" + new Date().getTime();
                                $("#phpscripts").attr("src", url);
                            }
                        }
                    }, function(result) {
                        if (result === true) {
                            testSocket.emit("run-result", { testIndex: data.testIndex, success: true });
                        } else {
                            testSocket.emit("run-result", { testIndex: data.testIndex, error: ""+result });
                        }
                    });
                } catch(e) {
                    testSocket.emit("run-result", { testIndex: data.testIndex, error: e + " " + e.stack });
                }
            });
        } catch(e) {
            testSocket.emit("run-result", { testIndex: data.testIndex, error: e + " " + e.stack });
        }
    });
    testSocket.on("init", function(data)
    {
        phpHostname = data.phpHostname;
        $("#phpscripts").attr("src", "http://" + phpHostname + "/?XDEBUG_SESSION_STOP");
    });
    window.runTests = function() {
        testSocket.emit("run-tests");
    }
}


function initUI(XDEBUG)
{
    var clients = {};

    function appendEvent(node, msg) {
        $('<div class="event">' + msg + '</div>').appendTo(node);
    }

    XDEBUG.on("connect", function(client)
    {
        var clientNode = $('<div class="client"><h3>Client ID: ' + client.id + '</h3></div>').appendTo($("#clients"));

        appendEvent(clientNode, "Connect");
        
        client.on("disconnect", function()
        {
            appendEvent(clientNode, "Disconnect");
        
            setTimeout(function() {
                clientNode.remove();
            }, 3000);
        });
        
        client.on("session", function(session)
        {
            var sessionNode = $('<div class="session"><h3>Session ID: ' + session.id + '</h3></div>').appendTo(clientNode);

            appendEvent(sessionNode, "Start");

            session.on("end", function()
            {
                appendEvent(sessionNode, "End");
                
                setTimeout(function() {
                    sessionNode.remove();
                }, 3000);
            });
            
            session.on("*", function(name, args)
            {
                if (name === "event")
                {
                    if (args.type === "status")
                    {
                        appendEvent(sessionNode, "Status: " + args.status);
                    }
                    else
                    if (args.type === "command")
                    {
                        appendEvent(sessionNode, "Command: " + args.name);
                    }
                    else
                        console.log("EVENT", name, args);
                }
                else
                    console.log("EVENT", name, args);
            });
        });
    });
}

/**
 * A client that is always connected as long as the page is open.
 * When tests are run additional clients will be connected.
 */
function initDefaultClient(XDEBUG)
{
    var client = new XDEBUG.Client({
        socketIO: io
    });

    client.on("connect", function()
    {
        
    });

    client.connect();   
}
