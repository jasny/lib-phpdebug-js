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
var HELPER = require("./_helper"),
    ASYNC = require("asyncjs"),
    ASSERT = require("assert"),
    XDEBUG = require("../lib/xdebug");

var Test = {
    name: "async",
    timeout: HELPER.getTestTimeout(),
    
    "test serverConnection": function(next) {
        var client = new XDEBUG.Client(HELPER.getXdebugClientOptions());
        client.on("connect", function() {
            client.disconnect();
        });
        client.on("disconnect", function() {
            next();
        });
        client.connect({
            id: "client-server-connection"
        });
    },
    
    "test browserConnection": function(next) {
        HELPER.runBrowserTest("connection", function() {
            next();
        });
    }
};

module.exports = require("asyncjs/lib/test").testcase(Test);
if (module === require.main) {
    HELPER.ready(function() {
        module.exports.run().report().summary(function(err, passed)
        {
        	HELPER.done(function()
	    	{
	    		process.exit(!err && passed ? 0 : 1);
	    	});
	    });
    });
}
