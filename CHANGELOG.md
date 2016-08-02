# Change Log

All notable changes to this project will be documented in this file.

## 1.0.0 - 2016-08-02

#### Backward-incompatible changes

- Support for Node versions below 4 has been removed as a result of 
upgrading the ws module to 1.x. See [#47][PR47] for details. This
module was upgraded because Node versions 6.2+ were experiencing a
critical RangeError bug that was causing unhandled exceptions to be
thrown.

- npm shrinkwrap has been removed from the project. This will cause
version upgrades for any dependencies that previously had been locked
down by the shrinkwrap, which could potentially cause behavior changes.
Please lock your application's dependencies down using your own 
shrinkwrap if you still need specific versions of this library's
dependencies.


[PR47]: https://github.com/asterisk/node-ari-client/pull/47
