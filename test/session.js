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
    ASYNC = require("../support/asyncjs/index"),
    ASSERT = require("assert"),
    XDEBUG = require("../lib/xdebug");

// NOTE: `HELPER.endSuite();` **MUST** be called at the end of the **LAST** test case!

var Test =
{
    name: "async",
    
    setUpSuite: function(next)
    {
        HELPER.startSuite(function() {
            next();
        });
    },


    "test serverSession": function(next)
    {
        var client = new XDEBUG.Client(HELPER.getXdebugClientOptions());

        client.on("connect", function(data)
        {
        	HELPER.debugScript("HelloWorld", "session1-server");
        });

        client.on("session", function(session)
        {
            session.on("end", function()
            {
                client.disconnect();
            });
            
            session.sendCommand("run");
        });

        client.on("disconnect", function(data)
        {
        	next();
        });

        client.connect();
    },

    "test browserSession": function(next)
    {
        HELPER.runBrowserTest("session", function() {
            HELPER.endSuite(function()
            {
                next();
            });
        });
    }
}

module.exports = require("../support/asyncjs/lib/test").testcase(Test);

if (module === require.main)
    HELPER.ready(function() {
        module.exports.exec();
    });
