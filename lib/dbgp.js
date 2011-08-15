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
    var PacketParser = exports.PacketParser = function(options)
    {
        this.API = options.API;
        this.options = options;
        this.listeners = {};
        this.buffer = "";

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
        
        // If chunk does not end in delimiter we got a partial chunk and need to buffer it.
        if (this.buffer !== "") {
        	chunk = this.buffer + chunk;
        	this.buffer = "";
        }
        if (!/\u0000$/.test(chunk)) {
        	this.buffer = chunk;
			return;
        }

        var parts = chunk.split(/\u0000/g),
        	lastPart;
        if ((lastPart = parts.pop()) !== "")
        	throw new Error("Chunk does not end in `\u0000`! Found instead: " + lastPart);
        if ((parts.length)%2)
            throw new Error("Invalid chunk format. Expecting `length[NULL]data[NULL]...`. Got: " + chunk);
        
        var length,
        	data;

        while(parts.length > 0)
        {
        	length = parts.shift();
        	data = parts.shift();

        	if (length != data.length)
                throw new Error("Announced packet length '" + length + "' does not match actual data length '" + data.length + "' for data '" + data + "'!");

        	// Check if we need to convert the XML message to a JSON one
            if (/\s*<\?xml\s/.test(data))
            {
                var parser = new this.API.XML2JS.Parser();
                parser.addListener("end", function(result)
                {
                	if (typeof result["#"] !== "undefined" && result["@"].encoding === "base64")
                	{
                		result["#"] = exports.base64_decode(result["#"]);
                	}
                    self.emit("packet", result);
                });
                parser.parseString(data);
            }
            else
                throw new Error("Cannot parse chunk. Chunk not in XML format!");
        }
    }


    exports.formatCommand = function(name, args, data)
    {
        // 6.3 IDE to debugger engine communications
        // @see http://www.xdebug.org/docs-dbgp.php#id30

    	if (!args || typeof args.i === "undefined")
    		throw new Error("The 'i' argument must be set!");
        
        // command [SPACE] [arguments] [SPACE] -- base64(data) [NULL]
        var command = [ name ];
        for (var key in args) {
            command.push(" -" + key + " " + args[key]);
        }
        if (typeof data !== "undefined" && data !== null)
            command.push(" --" + exports.base64_encode(data));

        command.push("\u0000");

        return command.join("");
    }
    

    /**
     * @see http://phpjs.org/functions/base64_encode:358
     */
    exports.base64_encode = function(data) {
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

        data = exports.utf8_encode(data + '');

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
    
    /**
     * @see http://phpjs.org/functions/base64_decode:357
     */
    exports.base64_decode = function(data) {
        // http://kevin.vanzonneveld.net
        // +   original by: Tyler Akins (http://rumkin.com)
        // +   improved by: Thunder.m
        // +      input by: Aman Gupta
        // +   improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
        // +   bugfixed by: Onno Marsman
        // +   bugfixed by: Pellentesque Malesuada
        // +   improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
        // +      input by: Brett Zamir (http://brett-zamir.me)
        // +   bugfixed by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
        // -    depends on: utf8_decode
        // *     example 1: base64_decode('S2V2aW4gdmFuIFpvbm5ldmVsZA==');
        // *     returns 1: 'Kevin van Zonneveld'
        // mozilla has this native
        // - but breaks in 2.0.0.12!
        //if (typeof this.window['btoa'] == 'function') {
        //    return btoa(data);
        //}
        var b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
        var o1, o2, o3, h1, h2, h3, h4, bits, i = 0,
            ac = 0,
            dec = "",
            tmp_arr = [];

        if (!data) {
            return data;
        }

        data += '';

        do { // unpack four hexets into three octets using index points in b64
            h1 = b64.indexOf(data.charAt(i++));
            h2 = b64.indexOf(data.charAt(i++));
            h3 = b64.indexOf(data.charAt(i++));
            h4 = b64.indexOf(data.charAt(i++));

            bits = h1 << 18 | h2 << 12 | h3 << 6 | h4;

            o1 = bits >> 16 & 0xff;
            o2 = bits >> 8 & 0xff;
            o3 = bits & 0xff;

            if (h3 == 64) {
                tmp_arr[ac++] = String.fromCharCode(o1);
            } else if (h4 == 64) {
                tmp_arr[ac++] = String.fromCharCode(o1, o2);
            } else {
                tmp_arr[ac++] = String.fromCharCode(o1, o2, o3);
            }
        } while (i < data.length);

        dec = tmp_arr.join('');
        dec = exports.utf8_decode(dec);

        return dec;
    }
    
    /**
     * @see http://phpjs.org/functions/utf8_encode:577
     */
    exports.utf8_encode = function(argString) {
        // http://kevin.vanzonneveld.net
        // +   original by: Webtoolkit.info (http://www.webtoolkit.info/)
        // +   improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
        // +   improved by: sowberry
        // +    tweaked by: Jack
        // +   bugfixed by: Onno Marsman
        // +   improved by: Yves Sucaet
        // +   bugfixed by: Onno Marsman
        // +   bugfixed by: Ulrich
        // +   bugfixed by: Rafal Kukawski
        // *     example 1: utf8_encode('Kevin van Zonneveld');
        // *     returns 1: 'Kevin van Zonneveld'

        if (argString === null || typeof argString === "undefined") {
            return "";
        }

        var string = (argString + ''); // .replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        var utftext = "",
            start, end, stringl = 0;

        start = end = 0;
        stringl = string.length;
        for (var n = 0; n < stringl; n++) {
            var c1 = string.charCodeAt(n);
            var enc = null;

            if (c1 < 128) {
                end++;
            } else if (c1 > 127 && c1 < 2048) {
                enc = String.fromCharCode((c1 >> 6) | 192) + String.fromCharCode((c1 & 63) | 128);
            } else {
                enc = String.fromCharCode((c1 >> 12) | 224) + String.fromCharCode(((c1 >> 6) & 63) | 128) + String.fromCharCode((c1 & 63) | 128);
            }
            if (enc !== null) {
                if (end > start) {
                    utftext += string.slice(start, end);
                }
                utftext += enc;
                start = end = n + 1;
            }
        }

        if (end > start) {
            utftext += string.slice(start, stringl);
        }

        return utftext;
    }
    
    /**
     * @see http://phpjs.org/functions/utf8_decode:576
     */
    exports.utf8_decode = function(str_data) {
        // http://kevin.vanzonneveld.net
        // +   original by: Webtoolkit.info (http://www.webtoolkit.info/)
        // +      input by: Aman Gupta
        // +   improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
        // +   improved by: Norman "zEh" Fuchs
        // +   bugfixed by: hitwork
        // +   bugfixed by: Onno Marsman
        // +      input by: Brett Zamir (http://brett-zamir.me)
        // +   bugfixed by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
        // *     example 1: utf8_decode('Kevin van Zonneveld');
        // *     returns 1: 'Kevin van Zonneveld'
        var tmp_arr = [],
            i = 0,
            ac = 0,
            c1 = 0,
            c2 = 0,
            c3 = 0;

        str_data += '';

        while (i < str_data.length) {
            c1 = str_data.charCodeAt(i);
            if (c1 < 128) {
                tmp_arr[ac++] = String.fromCharCode(c1);
                i++;
            } else if (c1 > 191 && c1 < 224) {
                c2 = str_data.charCodeAt(i + 1);
                tmp_arr[ac++] = String.fromCharCode(((c1 & 31) << 6) | (c2 & 63));
                i += 2;
            } else {
                c2 = str_data.charCodeAt(i + 1);
                c3 = str_data.charCodeAt(i + 2);
                tmp_arr[ac++] = String.fromCharCode(((c1 & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
                i += 3;
            }
        }

        return tmp_arr.join('');
    }

});
