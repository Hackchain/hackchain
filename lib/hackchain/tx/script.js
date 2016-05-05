'use strict';

const assert = require('assert');
const Buffer = require('buffer').Buffer;

const hackchain = require('../../hackchain');

function Script(opcodes) {
  // TODO(indutny): this should not be allocated here
  this.opcodes = opcodes || Buffer.alloc(0);
}
module.exports = Script;

Script.maxLen = 0x100;

Script.parse = function parse(buf) {
  assert(buf.size >= 4, 'Script: not enough data for the header');

  const script = new Script();

  const size = buf.readUInt32BE();
  if (size > Script.maxLen)
    throw new Error('Script: script is too long');

  script.opcodes = buf.take(size);

  return script;
};

Script._parseOpcode = function _parseOpcode(buf) {
  throw new Error('Not implemented');
};

Script.prototype.render = function render(buf) {
  buf.writeUInt32BE(this.opcodes.length);
  buf.copyFrom(this.opcodes);
  return buf;
};

Script.prototype.verify = function verify(type, callback) {
  if (this.opcodes.length > Script.maxLen)
    return callback(new Error('Script: script is too long'));

  callback(null, true);
};
