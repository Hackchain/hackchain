'use strict';

const assert = require('assert');
const Buffer = require('buffer').Buffer;

const OBuf = require('obuf');
const WBuf = require('wbuf');

const hackchain = require('../../hackchain');
const Assembler = hackchain.Interpreter.Assembler;

function Script(opcodes) {
  this.opcodes = opcodes || Buffer.alloc(0);
}
module.exports = Script;

Script.maxLen = 0x1000;

Script.parse = function parse(buf) {
  assert(buf.size >= 4, 'Script: not enough data for the header');

  const script = new Script();

  const size = buf.readUInt32BE();
  if (size > Script.maxLen)
    throw new Error('Script: script is too long');

  script.opcodes = buf.take(size);

  return script;
};

Script.compileTextArray = function compileTextArray(arr) {
  const asm = new Assembler();

  for (let i = 0; i < arr.length; i++) {
    let line = arr[i].split(/[\s,]+/g);

    let opcode = line[0];
    assert(Assembler.prototype.hasOwnProperty(opcode),
           `Client: Unknown opcode "${opcode}"`);

    const args = [];
    for (let i = 1; i < line.length; i++) {
      const arg = line[i];
      if (/^0x[0-9a-f]+$/.test(arg))
        args.push(parseInt(arg, 16));
      else if (/^-?\d+$/.test(arg))
        args.push(parseInt(arg, 10));
      else
        args.push(arg);
    }

    asm[opcode].apply(asm, args);
  }

  const buf = new WBuf();
  asm.render(buf);

  const code = Buffer.concat(buf.render());
  return new Script(code);
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

Script.prototype.inspect = function inspect() {
  let res = '<Script len: ' + this.opcodes.length  + '\n';

  const buf = new OBuf();
  buf.push(this.opcodes);

  const Disassembler = hackchain.Interpreter.Disassembler;

  const disasm = new Disassembler(buf);
  res += '      opcodes: [\n' + Disassembler.stringify(disasm.run()) + ']';

  return res + '>';
};
