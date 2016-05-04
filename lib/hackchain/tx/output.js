'use strict';

const assert = require('assert');
const BN = require('bn.js');

const TX = require('./');

function Output(value, script) {
  this.value = value;
  this.script = script;
}
module.exports = Output;

Output.valueLength = 8;

Output.prototype.validate = function validate() {
  assert(this.value.byteLength() <= Output.valueLength,
         'Output: value is too big');
};

Output.parse = function parse(buf) {
  assert(buf.has(Output.valueLength), 'Output: not enough data for the header');

  const res = new Output(null, null);
  res.value = new BN(buf.take(Output.valueLength));
  res.script = TX.Script.parse(buf);

  return res;
};

Output.prototype.render = function render(buf) {
  this.validate();

  const value = this.value.toBuffer('be', Output.valueLength);
  buf.copyFrom(value);
  this.script.render(buf);

  return buf;
};
