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

var DBGP = require("./dbgp");


var Server = exports.Server = function(options)
{
    var self = this;

    this.options = options;
    this.listeners = {};
    this.clients = {};
    this.sessions = {};
}

Server.prototype.on = function(name, callback)
{
    if (!this.listeners[name])
        this.listeners[name] = [];
    this.listeners[name].push(callback);
}

Server.prototype.emit = function(name, args)
{
    if (!this.listeners[name])
        return;
    args = args || {};
    for (var i=0, ic=this.listeners[name].length ; i<ic ; i++) {
        this.listeners[name][i].call(null, args);
    }
}

Server.prototype.hook = function(options)
{
    var self = this;

    options.namespace = options.namespace || "/lib-phpdebug";

    options.socketIO.of(options.namespace).on("connection", function(socket)
    {
        socket.on("connect-client", function(data, fn)
        {
            self.clients[socket.id] = socket;
            fn();
        });

        socket.on("disconnect-client", function(data, fn)
        {
            delete self.clients[socket.id];
            fn();
        });

        socket.on("disconnect", function(data)
        {
            delete self.clients[socket.id];
        });

        socket.on("command", function(data)
        {
            if (!self.sessions[data.session])
                return;
            self.sessions[data.session].sendCommand(data.name, data.args, data.data);
        });
    });
}

Server.prototype.listen = function(client)
{
    var self = this;
    
    function sendToClients(name, args)
    {
        for (var id in self.clients) {
            self.clients[id].emit(name, args);
        }
    }

    client.on("session", function(session)
    {
        self.sessions[session.id] = session;

        session.on("end", function()
        {
            delete self.sessions[session.id];
        });
        
        session.on("*", function(name, args)
        {
            sendToClients("event", {
                type: name,
                session: session.id,
                args: args
            });
        });
    });

    client.connect();
}
