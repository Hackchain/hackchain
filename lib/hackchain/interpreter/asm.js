'use strict';

const assert = require('assert');
const WBuf = require('wbuf');

const REGS = {
  r0: 0,
  r1: 1,
  r2: 2,
  r3: 3,
  r4: 4,
  r5: 5,
  r6: 6,
  r7: 7
};

const IRQ = {
  success: 0,
  'yield': 1,
  failure: 2
};

function Assembler() {
  this.buffer = new WBuf();
}
module.exports = Assembler;

Assembler.prototype.render = function render(buf) {
  const chunks = this.buffer.render();
  for (let i = 0; i < chunks.length; i++)
    buf.copyFrom(chunks[i]);
  return buf;
};

// Masm

function Label() {
  this.pc = null;
  this.jumps = [];
};

Assembler.prototype.label = function label() {
  return new Label();
};

Assembler.prototype.bind = function bind(label) {
  if (!label)
    label = this.label();

  label.pc = this.buffer.size;
  if (label.jumps.length === 0)
    return label;

  const jumps = label.jumps;
  label.jumps = null;

  const save = this.buffer;
  for (let i = 0; i < jumps.length; i++) {
    this.buffer = jumps[i].buffer;

    const delta = label.pc - jumps[i].pc;
    assert(-64 <= delta && delta <= 63, 'Assembler: jump delta overflow');

    this.beq('r0', 'r0', delta);
  }
  this.buffer = save;
};

Assembler.prototype.jmp = function jmp(label) {
  if (label.pc === null) {
    label.jumps.push({
      pc: this.buffer.size + 2,
      buffer: this.buffer.skip(2)
    });
    return;
  }

  const delta = label.pc - (this.buffer.size + 2);
  assert(-64 <= delta && delta <= 63, 'Assembler: jump delta overflow');

  this.beq('r0', 'r0', delta);
};

Assembler.prototype.nop = function nop() {
  this.add('r0', 'r0', 'r0');
};

// Assembly

Assembler.prototype.add = function add(a, b, c) {
  this.buffer.writeUInt16BE((REGS[a] << 10) | (REGS[b] << 7) | REGS[c]);
};

Assembler.prototype.addi = function addi(a, b, imm) {
  assert(-64 <= imm && imm <= 63, 'Assembler: addi immediate overflow');
  this.buffer.writeUInt16BE(
      (0x1 << 13) | (REGS[a] << 10) | (REGS[b] << 7) | ((imm >>> 0) & 0x7f));
};

Assembler.prototype.nand = function nand(a, b, c) {
  this.buffer.writeUInt16BE(
      (0x2 << 13) | (REGS[a] << 10) | (REGS[b] << 7) | REGS[c]);
};

Assembler.prototype.lui = function lui(a, imm) {
  assert(0 <= imm && imm <= 0x3ff, 'Assembler: lui immediate overflow');
  this.buffer.writeUInt16BE(
      (0x3 << 13) | (REGS[a] << 10) | ((imm >>> 0) & 0x3ff));
};

Assembler.prototype.sw = function sw(a, b, imm) {
  assert(-64 <= imm && imm <= 63, 'Assembler: addi immediate overflow');
  this.buffer.writeUInt16BE(
      (0x4 << 13) | (REGS[a] << 10) | (REGS[b] << 7) | ((imm >>> 0) & 0x7f));
};

Assembler.prototype.lw = function lw(a, b, imm) {
  assert(-64 <= imm && imm <= 63, 'Assembler: addi immediate overflow');
  this.buffer.writeUInt16BE(
      (0x5 << 13) | (REGS[a] << 10) | (REGS[b] << 7) | ((imm >>> 0) & 0x7f));
};

Assembler.prototype.beq = function beq(a, b, imm) {
  assert(-64 <= imm && imm <= 63, 'Assembler: addi immediate overflow');
  this.buffer.writeUInt16BE(
      (0x6 << 13) | (REGS[a] << 10) | (REGS[b] << 7) | ((imm >>> 0) & 0x7f));
};

Assembler.prototype.jalr = function jalr(a, b) {
  this.buffer.writeUInt16BE((0x7 << 13) | (REGS[a] << 10) | (REGS[b] << 7));
};

Assembler.prototype.irq = function irq(type) {
  assert(IRQ[type] !== undefined, `Assembler: unknown irq type "${type}"`);
  this.buffer.writeUInt16BE((0x7 << 13) | (IRQ[type] << 7) | 1);
};
