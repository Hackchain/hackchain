'use strict';

const async = require('async');
const assert = require('assert');
const crypto = require('crypto');

const BN = require('bn.js');
const Buffer = require('buffer').Buffer;
const WBuf = require('wbuf');

const hackchain = require('../../hackchain');

function TX() {
  this.version = TX.version;
  this.inputs = [];
  this.outputs = [];

  this.coinbase = false;
}
module.exports = TX;

TX.version = 1;
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
    tx.inputs.push(TX.Input.parse(buf));
  for (let i = 0; i < outputCount; i++)
    tx.outputs.push(TX.Output.parse(buf));

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
  // TODO(indutny): share this and cache it
  const buf = new WBuf();

  this.render(buf);

  const contents = buf.render();

  const hash = crypto.createHash('sha256');
  for (let i = 0; i < contents.length; i++)
    hash.update(contents[i]);
  return hash.digest();
};

TX.prototype.getFee = function getFee(chain, callback) {
  async.map(this.inputs, (input, callback) => {
    if (this.coinbase)
      return callback(null, hackchain.constants.coinbase);

    input.getValue(chain, callback);
  }, (err, results) => {
    if (err)
      return callback(err);

    let fee = new BN(0);

    for (let i = 0; i < results.length; i++)
      fee = fee.iadd(results[i]);

    for (let i = 0; i < this.outputs.length; i++)
      fee = fee.isub(this.outputs[i].value);

    return callback(null, fee);
  });
};

TX.prototype.verify = function verify(chain, callback) {
  if (this.inputs.length < 1)
    return callback(new Error('TX: not enough inputs'), false);
  if (this.outputs.length < 1)
    return callback(new Error('TX: not enough outputs'), false);

  if (this.coinbase && this.inputs.length !== 1)
    return callback(new Error('TX: too much inputs for a coinbase'), false);

  if (this.version !== TX.version)
    return callback(new Error('TX: stale version'), false);

  const hash = this.hash();

  async.parallel([
    (callback) => {
      // Coinbase has valid input a-priori
      if (this.coinbase)
        return callback(null, true);

      async.forEach(this.inputs, (input, callback) => {
        input.verify(hash, chain, callback);
      }, callback);
    },
    (callback) => {
      async.forEach(this.outputs, (output, callback) => {
        output.verify(chain, callback);
      }, callback);
    }
  ], (err) => {
    if (err)
      return callback(err, false);

    this.getFee(chain, (err, fee) => {
      if (err)
        return callback(err, false);

      if (fee.cmpn(0) < 0)
        return callback(new Error('TX: Negative fee'), false);

      return callback(null, true);
    });
  });
};

TX.prototype.checkDoubleSpend = function checkDoubleSpend(chain, callback) {
  async.forEach(this.inputs, (input, callback) => {
    chain.getTXSpentBy(input.hash.toString('hex'), input.index, (err, tx) => {
      if (err && !tx)
        return callback(null);
      return callback(new Error('TX: Double-spend attempt'));
    });
  }, callback);
};
