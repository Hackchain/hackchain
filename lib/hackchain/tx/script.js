'use strict';

const assert = require('assert');

function Script() {
  this.opcodes = [];
}
module.exports = Script;

Script.parse = function parse(buf) {
  assert(buf.size >= 4, 'Script: not enough data for the header');

  const script = new Script();

  const count = buf.readUInt32BE();
  for (let i = 0; i < count; i++)
    script.opcodes.push(Script._parseOpcode(buf));

  return script;
};

Script._parseOpcode = function _parseOpcode(buf) {
  throw new Error('Not implemented');
};

Script.prototype.render = function render(buf) {
  buf.writeUInt32BE(this.opcodes.length);
  for (let i = 0; i < this.opcodes.length; i++)
    this._renderOpcode(this.opcodes[i], buf);
  return buf;
};

Script.prototype._renderOpcode = function _renderOpcode(opcode, buf) {
  throw new Error('Not implemented');
  return buf;
};
