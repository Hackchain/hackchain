'use strict';

const BN = require('bn.js');
const Buffer = require('buffer').Buffer;

exports.empty = new Buffer(32).fill(0);

exports.coinbase = new BN(25 * 1000000);
