'use strict';

const path = require('path');

exports.version = require('package')(path.resolve(__dirname, '..')).version;

exports.utils = require('./hackchain/utils');

exports.Interpreter = require('./hackchain/interpreter');

exports.constants = require('./hackchain/constants');

exports.Entity = require('./hackchain/entity');

exports.TX = require('./hackchain/tx');
exports.Block = require('./hackchain/block');
exports.Pool = require('./hackchain/pool');
exports.Chain = require('./hackchain/chain');

// TODO(indutny): split into separate npm modules
exports.Server = require('./hackchain/server');
exports.Client = require('./hackchain/client');
exports.Debugger = require('./hackchain/debugger');
