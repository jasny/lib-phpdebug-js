
Links
=====

  * [DBGP Specification](http://www.xdebug.org/docs-dbgp.php)


Submodules
==========

Tutorial: [http://chrisjean.com/2009/04/20/git-submodules-adding-using-removing-and-updating/](http://chrisjean.com/2009/04/20/git-submodules-adding-using-removing-and-updating/)

Added:

    git submodule add git://github.com/jrburke/requirejs.git support/requirejs
    git submodule init
    git submodule update
    cd support/requirejs
    git checkout 0.24.0
    
    git submodule add git://github.com/ajaxorg/async.js.git support/asyncjs
    git submodule init
    git submodule update
    cd support/asyncjs
    git checkout d36ead408e2959b1e99572114ef3a1b6a48c1072
    
    git submodule add git://github.com/caolan/dispatch.git support/dispatch
    git submodule init
    git submodule update
    cd support/dispatch
    git checkout b56fb4ed7a63c5556c05435ec797137fe105a1c2
