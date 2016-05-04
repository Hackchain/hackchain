'use strict';

const assert = require('assert');
const crypto = require('crypto');

const WBuf = require('wbuf');

const hackchain = require('../hackchain');
const TX = hackchain.TX;

function Block(parent) {
  this.version = Block.version;
  this.parent = parent;
  this.txs = [];
}
module.exports = Block;

Block.version = 1;
Block.parentLength = 32;

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
