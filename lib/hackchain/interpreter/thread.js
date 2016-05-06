'use strict';

// Based on: http://www.eng.umd.edu/~blj/RiSC/RiSC-isa.pdf

const IRQ_SUCCESS = 1;
const IRQ_FAILURE = 2;
const IRQ_YIELD = 4;
const IRQ_MASK_DONE = IRQ_SUCCESS | IRQ_FAILURE | IRQ_YIELD;

function Thread(memory, pc) {
  this.memory = memory;

  this.pc = pc;
  this.regs = new Uint16Array(8);

  this.irq = 0;
}
module.exports = Thread;

Thread.prototype.isDone = function isDone() {
  return (this.irq & IRQ_MASK_DONE) !== 0;
};

Thread.prototype.isSuccess = function isSuccess() {
  return (this.irq & IRQ_SUCCESS) !== 0;
};

Thread.prototype.isFailure = function isFailure() {
  return (this.irq & IRQ_FAILURE) !== 0;
};

Thread.prototype.isYield = function isYield() {
  return (this.irq & IRQ_YIELD) !== 0;
};

Thread.prototype.clearYield = function clearYield() {
  this.irq &= ~IRQ_YIELD;
};

Thread.prototype.runOne = function runOne() {
  if (this.pc + 2 > this.memory.length) {
    this.irq |= IRQ_FAILURE;
    return;
  }

  const word = (this.memory[this.pc++] << 8) | this.memory[this.pc++];
  const opcode = word >>> 13;
  const regA = (word >>> 10) & 0x7;

  switch (opcode) {
    case 0x0: this.add(word, regA); break;
    case 0x1: this.addi(word, regA); break;
    case 0x2: this.nand(word, regA); break;
    case 0x3: this.lui(word, regA); break;
    case 0x4: this.sw(word, regA); break;
    case 0x5: this.lw(word, regA); break;
    case 0x6: this.beq(word, regA); break;
    case 0x7: this.jalr(word, regA); break;
    default: break;
  }
};

Thread.prototype.add = function add(word, a) {
  if (((word >> 3) & 0xf) !== 0) {
    this.irq |= IRQ_FAILURE;
    return;
  }

  if (a === 0)
    return;

  const b = this.regs[(word >> 7) & 0x7];
  const c = this.regs[word & 0x7];
  this.regs[a] = (b + c) & 0xffff;
};

Thread.prototype.addi = function addi(word, a) {
  if (a === 0)
    return;

  const b = this.regs[(word >> 7) & 0x7];
  const imm = ((word & 0x7f) << 25) >> 25;

  this.regs[a] = ((b + imm) >>> 0) & 0xffff;
};

Thread.prototype.nand = function nand(word, a) {
  if (((word >> 3) & 0xf) !== 0) {
    this.irq |= IRQ_FAILURE;
    return;
  }

  if (a === 0)
    return;

  const b = this.regs[(word >> 7) & 0x7];
  const c = this.regs[word & 0x7];
  this.regs[a] = 0xffff ^ (b & c);
};

Thread.prototype.lui = function lui(word, a) {
  if (a === 0)
    return;

  const imm = word & 0x3ff;

  this.regs[a] = imm << 6;
};

Thread.prototype.sw = function sw(word, a) {
  const b = this.regs[(word >> 7) & 0x7];
  const imm = ((word & 0x7f) << 25) >> 25;

  const addr = (b + imm) & 0xffff;

  this.memory[addr * 2] = this.regs[a] & 0xff;
  this.memory[addr * 2 + 1] = this.regs[a] >> 8;
};

Thread.prototype.lw = function lw(word, a) {
  const b = this.regs[(word >> 7) & 0x7];
  const imm = ((word & 0x7f) << 25) >> 25;

  if (a === 0)
    return;

  const addr = (b + imm) & 0xffff;

  this.regs[a] = this.memory[addr * 2] | (this.memory[addr * 2 + 1] << 8);
};

Thread.prototype.beq = function beq(word, a) {
  const b = this.regs[(word >> 7) & 0x7];
  const imm = ((word & 0x7f) << 25) >> 25;

  if (this.regs[a] === b)
    this.pc = (this.pc + imm * 2) & 0xffff;
};

Thread.prototype.jalr = function jalr(word, a) {
  const bi = (word >> 7) & 0x7;
  const b = this.regs[bi];

  const low = word & 0x7f;

  // IRQ
  if (low === 1 && a === 0) {
    if (bi === 0)
      this.irq |= IRQ_SUCCESS;
    else if (bi === 1)
      this.irq |= IRQ_YIELD;
    else
      this.irq |= IRQ_FAILURE;
    return;
  }

  if (low !== 0) {
    this.irq |= IRQ_FAILURE;
    return;
  }

  if (a !== 0)
    this.regs[a] = this.pc >> 1;
  this.pc = b * 2;
};
