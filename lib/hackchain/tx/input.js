'use strict';

const assert = require('assert');

const async = require('async');

const TX = require('./');

function Input(hash, index, script) {
  this.hash = hash;
  this.index = index;
  this.script = script;
}
module.exports = Input;

Input.hashSize = 32;  // sha256

Input.parse = function parse(buf) {
  assert(buf.has(Input.hashSize + 4), 'Input: not enough data for the header');

  const res = new Input(null, 0, null);
  res.hash = buf.take(Input.hashSize);
  res.index = buf.readUInt32BE();
  res.script = TX.Script.parse(buf);

  return res;
};

Input.prototype.render = function render(buf) {
  assert.equal(this.hash.length, Input.hashSize);

  buf.copyFrom(this.hash);
  buf.writeUInt32BE(this.index);
  this.script.render(buf);

  return buf;
};

Input.prototype.getValue = function getValue(chain, callback) {
  chain.getTX(this.hash, (err, prevTX) => {
    if (err)
      return callback(err);

    if (prevTX.outputs.length <= this.index)
      return callback(new Error('Input: not enough outputs in prevTX'));

    callback(null, prevTX.outputs[this.index].value);
  });
};

Input.prototype.verify = function verify(chain, callback) {
  async.parallel({
    prevTX: (callback) => {
      chain.getTX(this.hash, callback);
    },
    script: (callback) => {
      this.script.verify('input', callback);
    }
  }, (err, results) => {
    if (err)
      return callback(err);

    const prevTX = results.prevTX;
    if (prevTX.outputs.length <= this.index)
      return callback(new Error('Input: not enough outputs in prevTX'), false);

    const output = prevTX.outputs[this.index];

    // TODO(indutny): run scripts
    callback(null, true);
  });
};
