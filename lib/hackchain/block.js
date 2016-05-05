'use strict';

const assert = require('assert');
const crypto = require('crypto');

const async = require('async');
const WBuf = require('wbuf');

const hackchain = require('../hackchain');
const TX = hackchain.TX;

function Block(parent) {
  this.version = Block.version;
  this.parent = parent;
  this.txs = [];

  this.genesis = false;
}
module.exports = Block;

Block.version = 1;
Block.parentLength = 32;

Block.prototype.addCoinbase = function addCoinbase(tx) {
  assert.equal(this.txs.length, 0, 'Block: coinbase already present');
  this.txs.push(tx);
  tx.coinbase = true;
};

Block.prototype.addTX = function addTX(tx) {
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
    block.txs[0].coinbase = true;

  return block;
};

Block.prototype.render = function render(buf) {
  assert.equal(this.parent.length, Block.parentLength,
               'Block: invalid parent length');

  buf.writeUInt32BE(this.version);
  buf.copyFrom(this.parent);
  buf.writeUInt32BE(this.txs.length);

  for (let i = 0; i < this.txs.length; i++)
    this.txs[i].render(buf);

  return buf;
};

Block.prototype.hash = function hash() {
  const buf = new WBuf();

  this.render(buf);

  const hash = crypto.createHash('sha256');
  const chunks = buf.render();
  for (let i = 0; i < chunks.length; i++)
    hash.update(chunks[i]);
  return hash.digest();
};

Block.prototype.verify = function verify(chain, callback) {
  if (this.txs.length < 1)
    return callback(new Error('Block: No coinbase'), false);

  if (this.version !== Block.version)
    return callback(new Error('Block: Stale version'), false);

  const verifyTX = (tx, callback) => {
    return tx.verify(chain, callback);
  };

  chain.getBlock(this.parent, (err, parent) => {
    if (err && !this.genesis)
      return callback(err, false);

    async.forEach(this.txs, verifyTX, (err) => {
      if (err)
        return callback(err, false);
      else
        return callback(null, true);
    });
  });
};
