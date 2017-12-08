#!/usr/bin/env node
'use strict';

var _publishCommand = require('./publish-command');

var _publishCommand2 = _interopRequireDefault(_publishCommand);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var publishCommand = new _publishCommand2.default([], {}, __dirname);

publishCommand.run().then(function (_ref) {
  var exitCode = _ref.exitCode;

  console.log('Successfully finshed publish command.');
  process.exit(exitCode);
}).catch(function (_ref2) {
  var stack = _ref2.stack,
      exitCode = _ref2.exitCode;

  console.error('Error running publish command - ' + stack);
  process.exit(exitCode);
});
