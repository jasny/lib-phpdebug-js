Xdebug (PHP Debugger) client written in JavaScript
==================================================

This project includes:

  * An implementation of the [DBGP Protocol](http://www.xdebug.org/docs-dbgp.php):
    * Can run in the browser and on the server.
  * An intelligent [nodejs](http://nodejs.org/) based *DBGP* proxy server:
    * Expose an async *DBGP* interface to the browser via [socket.io](http://socket.io/).
    * Control *Xdebug* from the server, the browser or both at the same time.
  * A *Xdebug* client library that connects to *Xdebug* directly or to the proxy server.
  * A client UI showing events as they are executed used for development and testing.

NOTE: Only the core *DBGP* features are implemented at this time.


Usage
=====

Requirements
------------

  * [node.js](http://nodejs.org/) & *npm*
  * Webserver with *PHP* support
  * [PHP 5.2+ / 7.0+](http://php.net/) *cli* and *webserver* support
  * [Xdebug 2.2+](http://www.xdebug.org/) (see [Xdebug Install](http://www.xdebug.org/docs/install))

Install
-------

    npm install lib-phpdebug

From source

    git clone git://github.com/jasny/lib-phpdebug-js.git
    cd lib-phpdebug-js
    npm install

Setup
-----

Create a *virtual host* with *PHP* enabled and *Xdebug* installed (say `http://lib-phpdebug.localhost/`) and 
point it to `./php/`. This will be used to serve PHP scripts for the example client UI and automated tests.

Configure *Xdebug* in *php.ini*:

    xdebug.remote_enable=1
    xdebug.idekey=secret-key
    xdebug.remote_port=9000         // default
    xdebug.remote_host=localhost    // default
    xdebug.remote_autostart=0       // default

Launch debug proxy server:

    node ./example/server --port 9080 --php lib-phpdebug.localhost --idekey secret-key

Use `-v` to log major events to console and `-d` to log debug messages to console.

Test
----

The following will run a bunch of tests to cover all supported use-cases:

    node ./test/all --port 9080 --php lib-phpdebug.localhost --skip-browser-tests --idekey secret-key

TIP: If the example client is open at `http://localhost:9080/` it will show the progress of
the tests if the `--skip-browser-tests` argument is omitted.

Demo
----

Open the example client at `http://localhost:9080/` (served from the debug proxy server).

You can now use the client to run the test suite using the `Run All Tests` link.


Author
======

- The original implementation of this project is by [Christoph Dorn](http://www.christophdorn.com/).
- The project is maintained by [Jasny (Arnold Daniels)](http://www.jasny.net/).


License
=======

The MIT License

Copyright(c) 2011 Ajax.org B.V. <info AT ajax DOT org>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
