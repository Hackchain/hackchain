'use strict';

const BN = require('bn.js');
const Buffer = require('buffer').Buffer;

exports.empty = Buffer.alloc(32);
exports.genesis = exports.empty;

// 1 hcoin = 100000000 hatoshi
exports.coinbase = new BN(25 * 100000000);
