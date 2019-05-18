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
 */

var Server = exports.Server = function(options) {
    var self = this;

    this.options = options;
    this.debug = this.options.debug || false;
    this.verbose = this.options.verbose || false;
    this.listeners = {};
    this.clients = {};
    this.sessions = {};
};

Server.prototype.on = function(name, callback) {
    if (!this.listeners[name])
        this.listeners[name] = [];
    this.listeners[name].push(callback);
};

Server.prototype.emit = function(name, args) {
    if (!this.listeners[name])
        return;
    args = args || {};
    for (var i = 0, ic = this.listeners[name].length ; i < ic ; i++)
        this.listeners[name][i].call(null, args);
};

Server.prototype.hook = function(options) {
    var self = this;

    options.namespace = options.namespace || "/lib-phpdebug";

    options.socketIO.of(options.namespace).on("connection", function(socket) {
        socket.on("connect-client", function(data, fn) {
            if (self.verbose)
                console.log("Got `connect-client` for socket ID '" + socket.id + "' and client ID '" + data.id + "'");
            data.socket = socket;
            self.clients[socket.id] = data;
            fn();
        });

        socket.on("disconnect-client", function(data, fn) {
            if (self.verbose)
                console.log("Got `disconnect-client` for socket ID '" + socket.id + "' and client ID '" + self.clients[socket.id].id + "'");
            delete self.clients[socket.id];
            fn();
        });

        socket.on("disconnect", function(data) {
            if (self.verbose)
                console.log("Got `disconnect` for socket ID '" + socket.id + "' and client ID '" + self.clients[socket.id].id + "'");
            delete self.clients[socket.id];
        });

        socket.on("command", function(data, fn) {
            if (!self.sessions[data.session])
                return;
            // `fn()` returns the transaction ID that was used for the command to the client.
            fn(self.sessions[data.session].sendCommand(data.name, data.args, data.data));
        });
    });
};

Server.prototype.listen = function(client) {
    var self = this;
    
    function sendToClients(name, args, session) {
        for (var id in self.clients) {
            if (!session.lockedClientId || self.clients[id].id === session.lockedClientId) {
                self.clients[id].socket.emit(name, args);
            }
            else {
                if (self.debug)
                    console.log("Skip sending data for session '" + session.name + "' to client '" + self.clients[id].id + "' as session is locked to client '" + session.lockedClientId + "'.");
            }
        }
    }

    client.on("session", function(session) {
        self.sessions[session.id] = session;

        session.on("end", function() {
            delete self.sessions[session.id];
        });
        
        session.on("*", function(name, args) {
            sendToClients("event", {
                type: name,
                session: session.id,
                sessionName: session.name,
                args: args
            }, session);
        });
        
        self.emit("session", session);
    });

    client.connect({
        "id": "xdebug-" + client.options.xdebugPort
    });
};
