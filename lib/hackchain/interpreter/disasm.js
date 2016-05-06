'use strict';

const Buffer = require('buffer').Buffer;

function Disassembler(buffer) {
  this.buffer = buffer;
}
module.exports = Disassembler;

Disassembler.stringify = function stringify(opcodes) {
  return opcodes.map((opcode) => {
    let res = opcode.type;

    const args = [];
    if (opcode.a !== undefined)
      args.push('r' + opcode.a);
    if (opcode.b !== undefined)
      args.push('r' + opcode.b);
    if (opcode.c !== undefined)
      args.push('r' + opcode.c);
    if (opcode.cmd !== undefined)
      args.push(opcode.cmd);
    if (opcode.imm !== undefined) {
      if (opcode.imm < 0)
        args.push('-0x' + (-opcode.imm).toString(16));
      else
        args.push('0x' + opcode.imm.toString(16));
    }

    if (args.length !== 0)
      res += ' ' + args.join(', ');

    return res;
  }).join('\n');
};

Disassembler.prototype.run = function run() {
  if (this.buffer.size % 2 !== 0)
    this.buffer.push(Buffer.alloc(1));

  const lines = [];

  while (this.buffer.has(2)) {
    const word = this.buffer.readUInt16BE();

    const opcode = word >>> 13;
    const regA = (word >>> 10) & 0x7;

    let line;
    switch (opcode) {
      case 0x0: line = this.add(word, regA); break;
      case 0x1: line = this.addi(word, regA); break;
      case 0x2: line = this.nand(word, regA); break;
      case 0x3: line = this.lui(word, regA); break;
      case 0x4: line = this.sw(word, regA); break;
      case 0x5: line = this.lw(word, regA); break;
      case 0x6: line = this.beq(word, regA); break;
      case 0x7: line = this.jalr(word, regA); break;
      default: break;
    }

    lines.push(line);
  }

  return lines;
};

Disassembler.prototype.add = function add(word, a) {
  if (((word >> 3) & 0xf) !== 0) {
    return { type: '<invalid add>' };
  }

  const b = (word >> 7) & 0x7;
  const c = word & 0x7;

  return { type: 'add', a: a, b: b, c: c };
};

Disassembler.prototype.addi = function addi(word, a) {
  const b = (word >> 7) & 0x7;
  const imm = ((word & 0x7f) << 25) >> 25;

  return { type: 'addi', a: a, b: b, imm: imm };
};

Disassembler.prototype.nand = function nand(word, a) {
  if (((word >> 3) & 0xf) !== 0) {
    return { type: '<invalid nand>' };
  }

  const b = (word >> 7) & 0x7;
  const c = word & 0x7;

  return { type: 'nand', a: a, b: b, c: c };
};

Disassembler.prototype.lui = function lui(word, a) {
  const imm = word & 0x3ff;

  return { type: 'lui', a: a, imm: imm };
};

Disassembler.prototype.sw = function sw(word, a) {
  const b = (word >> 7) & 0x7;
  const imm = ((word & 0x7f) << 25) >> 25;

  return { type: 'sw', a: a, b: b, imm: imm };
};

Disassembler.prototype.lw = function lw(word, a) {
  const b = (word >> 7) & 0x7;
  const imm = ((word & 0x7f) << 25) >> 25;

  return { type: 'lw', a: a, b: b, imm: imm };
};

Disassembler.prototype.beq = function beq(word, a) {
  const b = (word >> 7) & 0x7;
  const imm = ((word & 0x7f) << 25) >> 25;

  return { type: 'beq', a: a, b: b, imm: imm };
};

Disassembler.prototype.jalr = function jalr(word, a) {
  const b = (word >> 7) & 0x7;

  const low = word & 0x7f;

  // IRQ
  if (low === 1 && a === 0) {
    if (b === 0)
      return { type: 'irq', cmd: 'success' };
    else if (b === 1)
      return { type: 'irq', cmd: 'yield' };
    else
      return { type: 'irq', cmd: 'failure' };
    return;
  }

  if (low !== 0) {
    return { type: '<invalid jalr>' };
  }

  return { type: 'jalr', a: a, b: b };
};
