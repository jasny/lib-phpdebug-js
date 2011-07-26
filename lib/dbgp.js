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
 *   A JavaScript implementation of the [DBGP Protocol](http://www.xdebug.org/docs-dbgp.php)
 *   used by [Xdebug](http://www.xdebug.org/).
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
	
	var commandCounter = 0;


	var PacketParser = exports.PacketParser = function(options)
	{
		this.API = options.API;
		this.options = options;
		this.listeners = {};

		if (!this.API.XML2JS)
			throw new Error("No converter API at `options.API.XML2JS`!");
	}
	
	PacketParser.prototype.on = function(name, callback)
	{
		if (!this.listeners[name])
			this.listeners[name] = [];
		this.listeners[name].push(callback);
	}

	PacketParser.prototype.emit = function(name, args)
	{
		if (!this.listeners[name])
			return;
		args = args || {};
		for (var i=0, ic=this.listeners[name].length ; i<ic ; i++) {
			this.listeners[name][i].call(null, args);
		}
	}

	PacketParser.prototype.parseChunk = function(chunk)
	{
		var self = this;

		// 6.4 debugger engine to IDE communications
		// @see http://www.xdebug.org/docs-dbgp.php#id31
		// TODO: May need a buffer here if incomplete chunks come in
		var parts = chunk.split(/\u0000/g);
		if (parts.length !== 3)
			throw new Error("Invalid chunk format. Expecting `length[NULL]data[NULL]`. Got: " + chunk);
		if (parts[0] != parts[1].length)
			throw new Error("Announced packet length '" + parts[0] + "' does not match actual data length '" + parts[1].length + "'.");

		// Check if we need to convert the XML message to a JSON one
		if (/\s*<\?xml\s/.test( parts[1]))
		{
			var parser = new this.API.XML2JS.Parser();
			parser.addListener("end", function(result)
			{
				self.emit("packet", result);
			});
		    parser.parseString(parts[1]);
		}
		else
			throw new Error("Cannot parse chunk. Chunk not in XML format!");
	}

	
	
	exports.formatCommand = function(name, args, data)
	{
		// 6.3 IDE to debugger engine communications
		// @see http://www.xdebug.org/docs-dbgp.php#id30
		
		args = args || {};
		args["i"] = (++commandCounter);
		
		// command [SPACE] [arguments] [SPACE] -- base64(data) [NULL]
		var command = [ name ];
		for (var key in args) {
			command.push(" -" + key + " " + args[key]);
		}
		if (typeof data !== "undefined")
			command.push(" --" + base64_encode(data));

		command.push("\u0000");

		return command.join("");
	}
	

	/**
	 * @see http://phpjs.org/functions/base64_encode:358
	 */
	function base64_encode(data) {
	    // http://kevin.vanzonneveld.net
	    // +   original by: Tyler Akins (http://rumkin.com)
	    // +   improved by: Bayron Guevara
	    // +   improved by: Thunder.m
	    // +   improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
	    // +   bugfixed by: Pellentesque Malesuada
	    // +   improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
	    // -    depends on: utf8_encode
	    // *     example 1: base64_encode('Kevin van Zonneveld');
	    // *     returns 1: 'S2V2aW4gdmFuIFpvbm5ldmVsZA=='
	    // mozilla has this native
	    // - but breaks in 2.0.0.12!
	    //if (typeof this.window['atob'] == 'function') {
	    //    return atob(data);
	    //}
	    var b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
	    var o1, o2, o3, h1, h2, h3, h4, bits, i = 0,
	        ac = 0,
	        enc = "",
	        tmp_arr = [];

	    if (!data) {
	        return data;
	    }

	    data = this.utf8_encode(data + '');

	    do { // pack three octets into four hexets
	        o1 = data.charCodeAt(i++);
	        o2 = data.charCodeAt(i++);
	        o3 = data.charCodeAt(i++);

	        bits = o1 << 16 | o2 << 8 | o3;

	        h1 = bits >> 18 & 0x3f;
	        h2 = bits >> 12 & 0x3f;
	        h3 = bits >> 6 & 0x3f;
	        h4 = bits & 0x3f;

	        // use hexets to index into b64, and append result to encoded string
	        tmp_arr[ac++] = b64.charAt(h1) + b64.charAt(h2) + b64.charAt(h3) + b64.charAt(h4);
	    } while (i < data.length);

	    enc = tmp_arr.join('');

	    switch (data.length % 3) {
	    case 1:
	        enc = enc.slice(0, -2) + '==';
	        break;
	    case 2:
	        enc = enc.slice(0, -1) + '=';
	        break;
	    }

	    return enc;
	}

});
