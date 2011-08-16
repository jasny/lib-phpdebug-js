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

define(function(require, exports, module)
{

    exports.run = function(ASSERT, XDEBUG, options, callback)
    {
        var client = new XDEBUG.Client(options);

        client.on("connect", function(data)
        {
            options.helpers.debugScript("Simple", "breakpoints-browser");
        });

        client.on("session", function(session)
        {
            session.on("end", function()
            {
                client.disconnect();
            });
            
            // After setting a breakpoint we continue with the session after
            // the `run` command returns and the breakpoint is hit. In production use,
            // one can listen for the break status only and ignore the return of the `run` command.
            var breakpointNotify = 0;
            session.on("event", function(event)
            {
            	if (event.type === "status" && event.status === "break")
            	{
            		if (event.raw['xdebug:message']["@"].lineno == 18)
            		{
            			breakpointNotify++;
	            		if (breakpointNotify === 2)
	            		{
	            			next3();
	            		}
            		}
            	}
            });

            // Watch stdout
            // @see http://xdebug.org/docs-dbgp.php#stdout-stderr
            // NOTE: Watching `stderr` does not work for some reason (always returns `args.success = 0`)
            session.sendCommand("stdout", {"c": 1}, null, function(args, data, raw)
            {
            	ASSERT.equal(args.success, "1");

            	// @see http://www.xdebug.org/docs-dbgp.php#status
                session.sendCommand("status", null, null, function(args, data, raw)
                {
					ASSERT.equal(args.status, "starting");
					ASSERT.equal(args.reason, "ok");

                	next1();
                });
            });
            
            // Line: 2
            function next1()
            {
            	// NOTE: If the first step command is `step_over` a `run` is issued by xdebug automatically!
            	//	     We issue a `step_into` instead so we can start stepping through code without breakpoints.
            	// @see http://www.xdebug.org/docs-dbgp.php#continuation-commands
                session.sendCommand("step_into", null, null, function(args, data, raw)
                {
					ASSERT.equal(data.lineno, "2");

					next2();
                });
            	
            }
            // Line: 3
            function next2()
            {
            	// @see http://www.xdebug.org/docs-dbgp.php#id1
                session.sendCommand("breakpoint_set", {
                	"t": "line",
                	"s": "enabled",
                	"n": 18
                }, null, function(args, data, raw)
                {
					ASSERT.equal(args.state, "enabled");
					
					// @see http://www.xdebug.org/docs-dbgp.php#id5
	                session.sendCommand("breakpoint_list", null, null, function(args1, data1, raw1)
                    {
						ASSERT.equal(data1["@"].lineno, "18");
						ASSERT.equal(data1["@"].id, args.id);
                	
						// @see http://www.xdebug.org/docs-dbgp.php#continuation-commands
		            	session.sendCommand("run", null, null, function()
		            	{
		            		breakpointNotify++;
		            		if (breakpointNotify === 2)
		            		{
		            			next3();
		            		}
		            	});
                    });
                });            	
            	
            }
            
            // Line: 18
            function next3()
            {
				// @see http://www.xdebug.org/docs-dbgp.php#stack-get
				session.sendCommand("stack_get", {"d": 0}, null, function(args, data, raw)
		        {
					ASSERT.equal(data["@"].lineno, "18");

					// @see http://www.xdebug.org/docs-dbgp.php#source
	                session.sendCommand("source", {"f": data["@"].filename, "b": data["@"].lineno, "e": data["@"].lineno}, null, function(args, data, raw)
	                {
						if (!/var_dump\(array_diff\(\$in1\['items'\], \$in2\['items'\]\)\);/.test(data)) ASSERT.fail(null, null, "source");

						next4();
	                });
                });
            }

            function next4()
            {
            	// @see http://www.xdebug.org/docs-dbgp.php#continuation-commands
            	session.sendCommand("run");
            }
        });

        client.on("disconnect", function(data)
        {
        	callback(true);
        });

        client.connect();
    }

});
