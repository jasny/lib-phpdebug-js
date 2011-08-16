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

    
    exports.base64_decode = DBGP.base64_decode;

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
        this.commandCounter = 0;
        this.commandCallbacks = {};
        
        this.on("ready", function()
        {
            self.status = "ready";
        });

        this.on("event", function(event)
        {
        	if (event.type === "command-response" && typeof self.commandCallbacks[event.id] === "function")
        	{
        		self.commandCallbacks[event.id](event.args, event.data, event.raw);
        		delete self.commandCallbacks[event.id];
        	}
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
        
        function stop()
        {
            // TODO: Collect data from debugger engine before issuing `stop` below.
            //       Client should register which data is to be collected when session initializes
            //       so we can just collect now and exit without needing client to issue a "stop".

            self.sendCommand("stop");
        }

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
                // Command responses
                if (typeof packet["@"].command !== "undefined")
                {
                	var args = {};
                	for (var name in packet["@"])
                	{
                		if (name !== "xmlns" && name !== "xmlns:xdebug" && name !== "transaction_id" && name !== "command")
                		{
                    		args[name] = packet["@"][name];
                		}
                	}

                	// Fill `data` with applicable data based on what is contained in packet.
					// TODO: This could be based on command to make this more deterministic
					var data = packet["#"];
					if (packet["xdebug:message"] && packet["xdebug:message"]["@"])
						data = packet["xdebug:message"]["@"];
					else if (packet["stack"])
						data = packet["stack"];
					else if (packet["context"])
						data = packet["context"];
					else if (packet["property"])
						data = packet["property"];
					else if (packet["breakpoint"])
						data = packet["breakpoint"];
					
                    self.emit("event", {type: "command-response", name: packet["@"].command, id: packet["@"].transaction_id, args: args, data: data, raw: packet});
                }
                else
                if (typeof packet["@"].type !== "undefined" && packet["@"].type === "stdout")
                {
                	self.emit("event", {type: "stdout", data: packet["#"], raw: packet});
                }
                else
                if (typeof packet["@"].status !== "undefined")
                {
                	// Do nothing. See below.
                }
                else
                {
console.log(packet);
                }
                
                if (typeof packet["@"].status !== "undefined")
                {
	                // 7.1 status
	                // @see http://www.xdebug.org/docs-dbgp.php#id37
	                if (packet["@"].status === "stopping")
	                {
	                    // State after completion of code execution. This typically happens 
	                    // at the end of code execution, allowing the IDE to further interact 
	                    // with the debugger engine (for example, to collect performance data, 
	                    // or use other extended commands).
	
	                    self.emit("event", {type: "status", status: packet["@"].status, raw: packet});
	                    
	                    stop();
	                }
	                else
	                if (packet["@"].status === "stopped")
	                {
	                    // IDE is detached from process, no further interaction is possible.
	                    self.status = "ended";
	                    self.emit("end", {raw: packet});
	                }
	                else
	                if (packet["@"].status === "starting" || packet["@"].status === "break")
	                {
	                    self.emit("event", {type: "status", status: packet["@"].status, raw: packet});
	                }
	                else
	                {
	                	
console.log('status', packet);
	                }
                }
            }
            else
            if (self.status === "init")
            {
            	// Authorize connecting debugger engine by IP if applicable
            	if (self.options.ips && self.options.ips.length > 0)
            	{
					var found = self.options.ips.indexOf(self.socket.remoteAddress);
					if (found === -1)
					{
						console.log("Error: IDEKEY mismatch!", self.socket.remoteAddress, self.options.ips);
						return;
					}
            	}
            	
				// Fix the init packet. This is needed due to a bug in Xdebug. Fixing it in Xdebug
				// at this stage may break a lot of clients using the DBGP protocol.
				// 1) When debugging CLI scripts and environment variables are set to:
				//        export XDEBUG_CONFIG="idekey=SESSION"
				//        export XDEBUG_CONFIG="idekey=,session=SESSION"
				//        export XDEBUG_CONFIG="idekey=IDEKEY,session=SESSION"
				//    the `packet["@"].idekey` property is set to (respectively):
				//        `packet["@"].idekey == "SESSION"`
				//        `packet["@"].idekey == ",session=SESSION"`
				//        `packet["@"].idekey == "IDEKEY,session=SESSION"`
				// 2) If debugging a MOD_APACHE script and cookies are set to:
				//        `XDEBUG_SESSION_START=SESSION`
				//    the `packet["@"].idekey` property is set to:
				//        `packet["@"].idekey == "SESSION"`
				//	  and the `xdebug.idekey` php.ini config option is ignored.
            	// Because we do not always get an `idekey` we need to restrict debug engines
            	// from connecting by IP whitelist and/or use a hash for the session ID.

				var idekey = packet["@"].idekey.split(",");
				packet["@"].idekey = undefined;
				if (idekey.length === 1) {
					packet["@"].session = idekey[0];
				} else {
					if (idekey.length != 2)
						throw new Error("`idekey` property in init packet does not have correct format (1)!");
					if (idekey[0]) {
						packet["@"].idekey = idekey[0];
					}
					var session = idekey[1].split("=");
					if (session.length != 2 || session[0] !== "session")
						throw new Error("`idekey` property in init packet does not have correct format (2)!");
					packet["@"].session = session[1];
				}

				// If `idekey` is set we authorize it
				if (packet["@"].idekey && self.options.idekeys && self.options.idekeys.length > 0)
				{
					var found = self.options.idekeys.indexOf(packet["@"].idekey);
					if (found === -1)
					{
						console.log("Error: IDEKEY mismatch!", packet["@"].idekey, self.options.idekeys);
						return;
					}
				}

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

    Session.prototype.sendCommand = function(name, args, data, callback)
    {
    	var self = this;
        if (this.socket)
        {
            args = args || {};
            args["i"] = "id" + (++this.commandCounter);
            if (typeof callback === "function")
            {
            	commandCallbacks[args["i"]] = callback;
            }

            // Relay command to all clients for display
            // TODO: Only do this if option is set
            this.emit("event", {type: "command", name: name, args: args, data: data});

            // send command to debug engine
            this.socket.write(DBGP.formatCommand(name, args, data));
            
            return args["i"];
        }
        else
        if (this.socketIO)
        {
            this.socketIO.emit("command", {
                session: this.id,
                name: name,
                args: args,
                data: data
            }, function(transactionID)
            {
                if (typeof callback === "function")
                {
                	self.commandCallbacks[transactionID] = callback;
                }
            });
        }
    }

});

