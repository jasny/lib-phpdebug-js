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

var Test =
{
    name: "async",
    timeout: HELPER.getTestTimeout(10000),	// The browser test can take some time
    
    "test serverStepping": function(next)
    {
        var client = new XDEBUG.Client(HELPER.getXdebugClientOptions());

        client.on("connect", function(data)
        {
        	HELPER.debugScript("Simple", "stepping-server");
        });

        client.on("session", function(session)
        {
            session.on("end", function()
            {
                client.disconnect();
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
            
            // Line: 0-3
            function next1()
            {
            	// NOTE: If the first step command is `step_over` a `run` is issued by xdebug automatically!
            	//	     We issue a `step_into` instead so we can start stepping through code without breakpoints.
            	// @see http://www.xdebug.org/docs-dbgp.php#continuation-commands
                session.sendCommand("step_into", null, null, function(args, data, raw)
                {
					ASSERT.equal(args.status, "break");
					ASSERT.equal(args.reason, "ok");
					if (!/\/scripts\/Simple\.php$/.test(data.filename)) ASSERT.fail(null, null, "filename");
					ASSERT.equal(data.lineno, "2");
					
	            	// @see http://www.xdebug.org/docs-dbgp.php#continuation-commands
                    session.sendCommand("step_over", null, null, function(args, data, raw)
                    {
                    	ASSERT.equal(args.status, "break");
    					ASSERT.equal(args.reason, "ok");
    					if (!/\/scripts\/Simple\.php$/.test(data.filename)) ASSERT.fail(null, null, "filename");
    					ASSERT.equal(data.lineno, "3");

    					next2();
                    });
                });
            	
            }
            // Line: 3
            function next2()
            {
            	// @see http://www.xdebug.org/docs-dbgp.php#stack-depth
                session.sendCommand("stack_depth", null, null, function(args, data, raw)
                {
					ASSERT.equal(args.depth, "1");

					// @see http://www.xdebug.org/docs-dbgp.php#stack-get
					session.sendCommand("stack_get", {"d": 0}, null, function(args, data, raw)
			        {
						ASSERT.equal(data["@"].where, "{main}");
						ASSERT.equal(data["@"].level, "0");
						ASSERT.equal(data["@"].type, "file");
						if (!/\/scripts\/Simple\.php$/.test(data["@"].filename)) ASSERT.fail(null, null, "filename");
						ASSERT.equal(data["@"].lineno, "3");

						next3();
	                });
                });
            }
            // Line: 3
            function next3()
            {
            	// @see http://www.xdebug.org/docs-dbgp.php#context-names
                session.sendCommand("context_names", null, null, function(args, data, raw)
                {
					ASSERT.equal(data.length, 2);
					ASSERT.equal(data[0]["@"].name, "Locals");
					ASSERT.equal(data[0]["@"].id, "0");
					
					ASSERT.equal(data[1]["@"].name, "Superglobals");
					ASSERT.equal(data[1]["@"].id, "1");

					// @see http://www.xdebug.org/docs-dbgp.php#context-get
	                session.sendCommand("context_get", {"d": 0, "c": "0"}, null, function(args, data, raw)
                    {
						ASSERT.equal(args.context, "0");
	        			
						ASSERT.equal(data["@"].name, "var1");
						ASSERT.equal(data["@"].fullname, "$var1");
						ASSERT.equal(data["@"].type, "uninitialized");

						// @see http://www.xdebug.org/docs-dbgp.php#context-get
						session.sendCommand("context_get", {"d": 0, "c": "1"}, null, function(args, data, raw)
                        {
    						ASSERT.equal(args.context, "1");

    						ASSERT.equal(data[0]["@"].name, "_COOKIE");
    						ASSERT.equal(data[1]["@"].name, "_ENV");
    						ASSERT.equal(data[2]["@"].name, "_FILES");
    						ASSERT.equal(data[3]["@"].name, "_GET");
    						ASSERT.equal(data[4]["@"].name, "_POST");
    						ASSERT.equal(data[5]["@"].name, "_REQUEST");
    						ASSERT.equal(data[6]["@"].name, "_SERVER");
    						ASSERT.equal(data[7]["@"].name, "GLOBALS");
    						
    		            	// @see http://www.xdebug.org/docs-dbgp.php#continuation-commands
    	                    session.sendCommand("step_over", null, null, function(args, data, raw)
    	                    {
    	                    	next4();
    	                    });
                        });
                    });
                });
            }
            // Line: 4
            function next4()
            {
            	// @see http://www.xdebug.org/docs-dbgp.php#context-names
                session.sendCommand("context_names", null, null, function(args, data, raw)
                {
					ASSERT.equal(data[0]["@"].id, "0");
                	
					// @see http://www.xdebug.org/docs-dbgp.php#context-get
	                session.sendCommand("context_get", {"d": 0, "c": "0"}, null, function(args, data, raw)
                    {
						ASSERT.equal(args.context, "0");
						
						ASSERT.equal(data["@"].name, "var1");
						ASSERT.equal(data["@"].fullname, "$var1");
						ASSERT.equal(data["@"].type, "array");
						ASSERT.equal(data["@"].children, "1");
						ASSERT.equal(data["@"].numchildren, "2");

						ASSERT.equal(data.property[0]["@"].name, "key");
						ASSERT.equal(data.property[0]["@"].fullname, "$var1['key']");
						ASSERT.equal(data.property[0]["@"].type, "string");
						ASSERT.equal(XDEBUG.base64_decode(data.property[0]["#"]), "value1");

						ASSERT.equal(data.property[1]["@"].name, "items");
						ASSERT.equal(data.property[1]["@"].fullname, "$var1['items']");
						ASSERT.equal(data.property[1]["@"].type, "array");
						ASSERT.equal(data.property[1]["@"].children, "1");
						ASSERT.equal(data.property[1]["@"].numchildren, "2");

						// @see http://www.xdebug.org/docs-dbgp.php#property-get-property-set-property-value
		                session.sendCommand("property_get", {"d": 0, "c": "0", "n": "$var1['items']"}, null, function(args, data, raw)
                        {
							ASSERT.equal(data["@"].name, "$var1['items']");
							ASSERT.equal(data["@"].fullname, "$var1['items']");
							
							ASSERT.equal(data.property[0]["@"].name, "0");
							ASSERT.equal(data.property[0]["@"].fullname, "$var1['items'][0]");
							ASSERT.equal(XDEBUG.base64_decode(data.property[0]["#"]), "item1");
							
							ASSERT.equal(data.property[1]["@"].name, "1");
							ASSERT.equal(data.property[1]["@"].fullname, "$var1['items'][1]");
							ASSERT.equal(XDEBUG.base64_decode(data.property[1]["#"]), "item2");

							next5();
                        });
                    });
                });
            }
            // Line: 4-18
            function next5()
            {
            	// @see http://www.xdebug.org/docs-dbgp.php#continuation-commands
                session.sendCommand("step_over", null, null, function(args, data, raw)
                {
					ASSERT.equal(data.lineno, "5");
	                session.sendCommand("step_into", null, null, function(args, data, raw)
                    {
						ASSERT.equal(data.lineno, "9");
	                    session.sendCommand("step_over", null, null, function(args, data, raw)
                        {
							ASSERT.equal(data.lineno, "10");
	                        session.sendCommand("step_over", null, null, function(args, data, raw)
	                        {
								ASSERT.equal(data.lineno, "11");
	        	                session.sendCommand("step_into", null, null, function(args, data, raw)
    	                        {
									ASSERT.equal(data.lineno, "12");
		        	                session.sendCommand("step_into", null, null, function(args, data, raw)
	    	                        {
										ASSERT.equal(data.lineno, "16");
		        	                    session.sendCommand("step_over", null, null, function(args, data, raw)
	    	                            {
											ASSERT.equal(data.lineno, "17");
		        		                    session.sendCommand("step_over", null, null, function(args, data, raw)
	    		                            {
												ASSERT.equal(data.lineno, "18");
	                	
												next6();
	    	    	                        });
    	    	                        });
        	                        });
    	                        });
	                        });
                        });
                    });
                });
            	
            }
            // Line: 18
            function next6()
            {
            	// @see http://www.xdebug.org/docs-dbgp.php#context-names
                session.sendCommand("context_names", null, null, function(args, data, raw)
                {
					ASSERT.equal(data[0]["@"].id, "0");
					
					// @see http://www.xdebug.org/docs-dbgp.php#context-get
					session.sendCommand("context_get", {"d": 0, "c": "0"}, null, function(args, data, raw)
					{
						ASSERT.equal(args.context, "0");

						ASSERT.equal(data[0]["@"].fullname, "$in1");
						ASSERT.equal(data[0].property[1]["@"].numchildren, "3");
						ASSERT.equal(XDEBUG.base64_decode(data[0].property[0]["#"]), "value1");
						
						ASSERT.equal(data[1]["@"].fullname, "$in2");
						ASSERT.equal(data[1].property[1]["@"].numchildren, "2");
						ASSERT.equal(XDEBUG.base64_decode(data[1].property[0]["#"]), "value1");

						next7();
					});
                });
            }
            // Line: 18
            function next7()
            {
				// @see http://www.xdebug.org/docs-dbgp.php#stack-get
				session.sendCommand("stack_get", {"d": 0}, null, function(args, data, raw)
		        {
	            	// @see http://www.xdebug.org/docs-dbgp.php#source
	                session.sendCommand("source", {"f": data["@"].filename, "b": 18, "e": 18}, null, function(args, data, raw)
	                {
						if (!/var_dump\(array_diff\(\$in1\['items'\], \$in2\['items'\]\)\);/.test(data)) ASSERT.fail(null, null, "source");

						next8();
	                });
                });
            }

            function next8()
            {
            	session.sendCommand("run");
            }
        });

        client.on("disconnect", function(data)
        {
        	next();
        });

        client.connect({
        	id: "client-server-stepping"
        });
    },

    "test browserStepping": function(next)
    {
        HELPER.runBrowserTest("stepping", function() {
            next();
        }, 10000);
    }

}

module.exports = require("../support/asyncjs/lib/test").testcase(Test);

if (module === require.main)
    HELPER.ready(function() {
        module.exports.run().report().summary(function(err, passed)
        {
        	HELPER.done(function()
	    	{
	    		process.exit(!err && passed ? 0 : 1);
	    	});
	    });
    });
