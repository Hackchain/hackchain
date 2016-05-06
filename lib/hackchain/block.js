'use strict';

const assert = require('assert');
const util = require('util');

const async = require('async');

const hackchain = require('../hackchain');
const TX = hackchain.TX;

function Block(parent) {
  hackchain.Entity.call(this);

  this.version = Block.version;
  this.parent = parent;
  this.txs = [];
}
util.inherits(Block, hackchain.Entity);
module.exports = Block;

Block.version = 1;
Block.parentLength = 32;

Block.prototype.addCoinbase = function addCoinbase(tx) {
  assert(!this.readonly, 'Block: modifications not allowed after render');

  assert.equal(this.txs.length, 0, 'Block: coinbase already present');
  tx.markAsCoinbase();
  this.txs.push(tx);
};

Block.prototype.addTX = function addTX(tx) {
  assert(!this.readonly, 'Block: modifications not allowed after render');

  assert.notEqual(this.txs.length, 0, 'Block: coinbase should be added first');
  this.txs.push(tx);
};

Block.parse = function parse(buf) {
  assert(buf.has(Block.parentLength + 8), 'Block: not enough data for header');

  const version = buf.readUInt32BE();
  const parent = buf.take(Block.parentLength);

  const block = new Block(parent);
  block.version = version;
  assert.equal(block.version, 1,
               'Block: only version=1 is supported at the moment');

  const count = buf.readUInt32BE();
  for (let i = 0; i < count; i++)
    block.txs.push(TX.parse(buf));

  if (block.txs.length >= 1)
    block.txs[0].markAsCoinbase();

  return block;
};

Block.prototype._render = function _render(buf) {
  assert.equal(this.parent.length, Block.parentLength,
               'Block: invalid parent length');

  buf.writeUInt32BE(this.version);
  buf.copyFrom(this.parent);
  buf.writeUInt32BE(this.txs.length);

  for (let i = 0; i < this.txs.length; i++)
    this.txs[i].render(buf);

  return buf;
};

Block.prototype.verify = function verify(chain, callback) {
  if (this.txs.length < 1)
    return callback(new Error('Block: No coinbase'), false);

  if (this.version !== Block.version)
    return callback(new Error('Block: Stale version'), false);

  const verifyTX = (tx, callback) => {
    return tx.verify(chain, callback);
  };

  const verifyTXs = (callback) => {
    async.forEach(this.txs, verifyTX, (err) => {
      if (err)
        return callback(err, false);
      else
        return callback(null, true);
    });
  };

  if (this.parent.equals(hackchain.constants.genesis))
    return verifyTXs(callback);

  chain.getBlock(this.parent, (err, parent) => {
    if (err)
      return callback(err, false);

    verifyTXs(callback);
  });
};

Block.prototype.inspect = function inspect() {
  return '<Block: ' + this.hash().toString('hex') + '\n' +
         '   parent: ' + this.parent.toString('hex') + '\n' +
         '   txs: ' + util.inspect(this.txs) +
         '>';
};
