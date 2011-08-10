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
 *   A [Xdebug](http://www.xdebug.org/) client that connects to Xdebug directly
 *   (for use on server) or to the debug proxy server (for use in browser).
 *   
 *   Provides all the wrapping to make `./dbgp` usable on server and in browser
 *   and abstracts [DBGP Protocol](http://www.xdebug.org/docs-dbgp.php) to
 *   hide low-level connection and session logic.
 *   
 */

/**
 * AMD wrapper if running on server
 */
if (typeof define === "undefined")
{
    var define = function(factory)
    {
        factory(require, exports, module);
    };
}

define(function(require, exports, module)
{

    var DBGP = require("./dbgp");


    var listeners = {},
        clients = {},
        clientCounter = 0,
        sessionCounter = 0;


    /**
     * Listen to global Xdebug events
     */
    exports.on = function(name, callback)
    {
        if (!listeners[name])
            listeners[name] = [];
        listeners[name].push(callback);
    }
    
    /**
     * Dispatch global Xdebug events
     */
    function emit(name, args)
    {
        if (!listeners[name])
            return;
        args = args || null;
        for (var i=0, ic=listeners[name].length ; i<ic ; i++) {
            listeners[name][i].call(null, args);
        }
    }


    /**
     * A Xdebug client for use on the server and the browser.
     * 
     * Browser use (connects to proxy server):
     * 
     *   new Client({
     *      socketIO: $socket_io_instance
     *   });
     * 
     * Server use (listens for xdebug connections):
     *   
     *   new Client({
     *      API: {
     *          NET: require("net"),        // <- nodejs native
     *          XML2JS: require("xml2js")   // <- `npm install xml2js` -> https://github.com/Leonidas-from-XIV/node-xml2js/
     *      },
     *      xdebugPort: 9000
     *   });
     *   
     * Server use (connects to proxy server):
     *   
     *   new Client({
     *      socketIO: $proxy_server_fake_socket_io_client_instance
     *   });
     * 
     * @param Object options
     */
    var Client = exports.Client = function(options)
    {
        options.namespace = options.namespace || "/lib-phpdebug";

        this.API = options.API;
        this.options = options;
        this.listeners = {};
        this.sessions = {};
        this.connected = false;

        // NOTE: The client ID is unique to the environment only, not globally!
        this.id = "client-" + (++clientCounter);
    };

    Client.prototype.on = function(name, callback)
    {
        if (!this.listeners[name])
            this.listeners[name] = [];
        this.listeners[name].push(callback);
    }

    Client.prototype.emit = function(name, args)
    {
        if (this.listeners[name]) {
            args = args || {};
            for (var i=0, ic=this.listeners[name].length ; i<ic ; i++) {
                this.listeners[name][i].call(null, args);
            }
        }
        if (this.listeners["*"]) {
            for (var i=0, ic=this.listeners["*"].length ; i<ic ; i++) {
                this.listeners["*"][i].call(null, name, args);
            }
        }
    }

    Client.prototype.connect = function()
    {
        var self = this;
        
        if (this.connected)
            throw new Error("Client already connected!");

        if (typeof this.options.xdebugPort !== "undefined")
        {
            this.engineServer = null;
            initDebuggerEngineListener();
        }
        else
        if (typeof this.options.socketIO !== "undefined")
        {
            this.proxySocket = null;
            initProxyListener();
        }
        else
            throw new Error("No `xdebugPort` nor `socketIO` key set in `options`.");

        /**
         * Listen for Xdebug debugger engine connections on port `this.options.xdebugPort`.
         */
        function initDebuggerEngineListener()
        {
            self.engineServer = self.API.NET.createServer(function(socket)
            {
                var session = new Session(self.options);

                session.on("ready", function()
                {
                    self.sessions[session.id] = session;

                    self.emit("session", session);
                });
                
                session.on("end", function()
                {
                    delete self.sessions[session.id];
                });
                
                session.listen(socket);
            });
            self.engineServer.listen(self.options.xdebugPort, "localhost");

            self.connected = true;

            clients[self.id] = self;
            
            self.emit("connect");
            emit("connect", self);
        }

        /**
         * Connect to a debug proxy server via `this.options.socketIO`.
         */
        function initProxyListener()
        {
            function triggerConnect()
            {
                if (clients[self.id])
                    return;

                clients[self.id] = true;

                self.proxySocket.emit("connect-client", {}, function()
                {
                    self.connected = true;

                    clients[self.id] = self;

                    emit("connect", self);
                    self.emit("connect");
                });
            }
            
            self.proxySocket = self.options.socketIO.connect('http://localhost:' + (self.options.socketIOPort || "") + self.options.namespace, {
                reconnect: true
            });

            self.proxySocket.on("connect", function()
            {
                triggerConnect();
            });

            self.proxySocket.on("reconnect", function()
            {
                triggerConnect();
            });

            self.proxySocket.on("disconnect", function()
            {
                self.disconnect();
            });
            
            self.proxySocket.on("event", function(event)
            {
                if (!self.connected)
                    return;

                if (!self.sessions[event.session])
                {
                    var session = self.sessions[event.session] = new Session();

                    session.on("end", function()
                    {
                        delete self.sessions[session.id];
                    });
                    
                    session.sync(self.proxySocket, event.session);

                    self.emit("session", session);
                }

                self.sessions[event.session].emit(event.type, event.args);
            });

            triggerConnect();
        }
    }

    Client.prototype.disconnect = function()
    {
        var self = this;
        
        if (!this.connected)
            return;

        function done()
        {
            self.connected = false;

            delete clients[self.id];

            self.emit("disconnect");
            emit("disconnect", self);
        }

        if (this.engineServer)
        {
            this.engineServer.close();
            this.engineServer = null;
            done();
        }
        else
        if (this.proxySocket)
        {
            if (this.proxySocket.connected)
            {
                this.proxySocket.emit("disconnect-client", {}, function()
                {
                    done();
                });
            }
            else
            {
                done();
            }
        }
    }


    
    var Session = exports.Session = function(options)
    {
        var self = this;

        options = options || {};
        this.API = options.API;
        this.options = options;
        this.listeners = {};
        this.status = "init";   // init, ready, aborted, ended
        this.socketIO = null;
        this.socket = null;
        
        this.on("ready", function()
        {
            self.status = "ready";
        });
    }

    Session.prototype.on = function(name, callback)
    {
        if (!this.listeners[name])
            this.listeners[name] = [];
        this.listeners[name].push(callback);
    }

    Session.prototype.emit = function(name, args)
    {
        if (this.listeners[name]) {
            args = args || {};
            for (var i=0, ic=this.listeners[name].length ; i<ic ; i++) {
                this.listeners[name][i].call(null, args);
            }
        }
        if (this.listeners["*"]) {
            for (var i=0, ic=this.listeners["*"].length ; i<ic ; i++) {
                this.listeners["*"][i].call(null, name, args);
            }
        }
    }
    
    Session.prototype.listen = function(socket)
    {
        var self = this;
        
        this.socket = socket;

        var parser = new DBGP.PacketParser({
            API: self.API
        });
        
        parser.on("packet", function(packet)
        {
            if (self.status === "ready")
            {
                // 6.5 debugger engine errors
                // @see http://www.xdebug.org/docs-dbgp.php#id32
                if (packet.error)
                {
                    self.emit("event", {type: "error", error: packet.error, raw: packet});
                }
                else

                // 7.1 status
                // @see http://www.xdebug.org/docs-dbgp.php#id37
                if (packet["@"].status === "stopping")
                {
                    // State after completion of code execution. This typically happens 
                    // at the end of code execution, allowing the IDE to further interact 
                    // with the debugger engine (for example, to collect performance data, 
                    // or use other extended commands).
    
                    self.emit("event", {type: "status", status: packet["@"].status, raw: packet});
    
                    // TODO: Collect data from debugger engine before issuing `stop` below.
                    //       Client should register which data is to be collected when session initializes
                    //       so we can just collect now an exit without needing client to issue a "stop".
    
                    self.sendCommand("stop");
                }
                else
                if (packet["@"].status === "stopped")
                {
                    // IDE is detached from process, no further interaction is possible.
                    self.status = "ended";
                    self.emit("end", {raw: packet});
                }
                else
                    
                {
    
                    
console.log(data);
                }
            }
            else
            if (self.status === "init")
            {
                // 5.2 Connection Initialization
                // @see http://www.xdebug.org/docs-dbgp.php#id18
                self.id = "session-" + (++sessionCounter);
                if (packet["@"].appid)
                    self.id += "-" + packet["@"].appid;
                if (packet["@"].session)
                    self.id += "-" + packet["@"].session;
                if (packet["@"].thread)
                    self.id += "-" + packet["@"].thread;
                if (packet["@"].idekey)
                    self.id += "-" + packet["@"].idekey;

                self.emit("init", {raw: packet});

                // 5.4 Multiple Processes or Threads
                // @see http://www.xdebug.org/docs-dbgp.php#id23
                // TODO: feature_set command with the feature name of 'multiple_sessions'
                
                // 5.5 Feature Negotiation
                // @see http://www.xdebug.org/docs-dbgp.php#id24
    
                self.emit("ready", {raw: packet});
            }
        });

        this.socket.on("data", function(chunk)
        {
            parser.parseChunk(chunk.toString());
        });     

        this.socket.on("end", function()
        {
            if (self.status === "ended" || self.status === "aborted")
                return;
            self.status = "aborted";
            self.emit("end", {
                aborted: true
            });
        });
    }
    
    Session.prototype.sync = function(socketIO, id)
    {
        this.socketIO = socketIO;
        this.id = id;
    }

    Session.prototype.sendCommand = function(name, args, data)
    {
        if (this.socket)
        {
            // Relay command to all clients for display
            // TODO: Only do this if option is set
            this.emit("event", {type: "command", name: name, args: args, data: data});

            // send command to debug engine
            this.socket.write(DBGP.formatCommand(name, args, data));
        }
        else
        if (this.socketIO)
        {
            this.socketIO.emit("command", {
                session: this.id,
                name: name,
                args: args,
                data: data
            });
        }
    }

});

