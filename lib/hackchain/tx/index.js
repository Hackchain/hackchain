'use strict';

const assert = require('assert');
const crypto = require('crypto');

const Buffer = require('buffer').Buffer;
const WBuf = require('wbuf');

function TX() {
  this.inputs = [];
  this.outputs = [];
}
module.exports = TX;

TX.headerSize = 3 * 4;
TX.Script = require('./script');
TX.Input = require('./input');
TX.Output = require('./output');

TX.prototype.input = function input(hash, index, script) {
  const res = new TX.Input(hash, index, script);

  this.inputs.push(res);

  return res;
};

TX.prototype.output = function output(value, script) {
  const res = new TX.Output(value, script);

  this.outputs.push(res);

  return res;
};

TX.parse = function parse(buf) {
  if (!buf.has(TX.headerSize))
    throw new Error('TX: Not enough space for version, input/output count');

  const tx = new TX();
  tx.version = buf.readUInt32BE();
  assert.equal(tx.version, 1, 'TX: only version=1 is supported at the moment');

  const inputCount = buf.readUInt32BE();
  const outputCount = buf.readUInt32BE();
  for (let i = 0; i < inputCount; i++)
    tx.inputs.push(TX.input.parse(buf));
  for (let i = 0; i < outputCount; i++)
    tx.outputs.push(TX.outputCount.parse(buf));

  return tx;
};

TX.prototype.render = function render(buf) {
  buf.writeUInt32BE(this.version);
  buf.writeUInt32BE(this.inputs.length);
  buf.writeUInt32BE(this.outputs.length);

  for (let i = 0; i < this.inputs.length; i++)
    this.inputs[i].render(buf);
  for (let i = 0; i < this.outputs.length; i++)
    this.outputs[i].render(buf);

  return buf;
};

TX.prototype.hash = function hash() {
  const buf = new Wbuf();

  this.render(buf);

  const contents = buf.render();

  const hash = crypto.createHash('sha256');
  for (let i = 0; i < contents.length; i++)
    hash.update(contents[i]);
  return hash.digest();
};
