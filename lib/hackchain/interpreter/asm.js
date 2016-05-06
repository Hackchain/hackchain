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

  this.labels = new Map();

  this._codeOffset = 0;
}
module.exports = Assembler;

Assembler.prototype.render = function render(buf) {
  for (let label of this.labels.values())
    assert(label.pc !== null, `Assembler: label "${label.name}" unbound`);

  const chunks = this.buffer.render();
  for (let i = 0; i < chunks.length; i++)
    buf.copyFrom(chunks[i]);
  return buf;
};

// Masm

function Label(name) {
  this.pc = null;
  this.jumps = [];
  this.farjumps = [];

  this.name = name || 'unnamed';
};

Assembler.prototype.codeOffset = function codeOffset(offset) {
  this._codeOffset = offset;
};

Assembler.prototype.label = function label(name) {
  if (this.labels.has(name))
    return this.labels.get(name);

  const label = new Label(name);
  this.labels.set(name, label);
  return label;
};

Assembler.prototype.bind = function bind(label) {
  if (!label)
    label = this.label();
  if (typeof label === 'string')
    label = this.label(label);

  label.pc = this._codeOffset + (this.buffer.size >> 1);

  this._resolveJumps(label.jumps, label.pc);
  this._resolveFarJumps(label.farjumps, label.pc);

  label.jumps = null;
  label.farjumps = null;

  return label;
};

Assembler.prototype._resolveJumps = function _resolveJumps(jumps, pc) {
  const save = this.buffer;
  for (let i = 0; i < jumps.length; i++) {
    this.buffer = jumps[i].buffer;

    const delta = pc - jumps[i].pc;
    assert(-64 <= delta && delta <= 63, 'Assembler: jump delta overflow');

    this.beq('r0', 'r0', delta);
  }
  this.buffer = save;
};

Assembler.prototype._resolveFarJumps = function _resolveFarJumps(jumps, pc) {
  const save = this.buffer;
  for (let i = 0; i < jumps.length; i++) {
    this.buffer = jumps[i].buffer;

    this.movi(jumps[i].reg, pc);
    this.jalr('r0', jumps[i].reg);
  }
  this.buffer = save;
};

Assembler.prototype.jmp = function jmp(label) {
  assert.equal(arguments.length, 1, 'Assembler: `jmp` takes 1 argument');

  if (typeof label === 'string')
    label = this.label(label);

  if (label.pc === null) {
    label.jumps.push({
      pc: (this.buffer.size >> 1) + 1,
      buffer: this.buffer.skip(2)
    });
    return;
  }

  const delta = label.pc - ((this.buffer.size >> 1) + 1);
  assert(-64 <= delta && delta <= 63, 'Assembler: jump delta overflow');

  this.beq('r0', 'r0', delta);
};

Assembler.prototype.farjmp = function farjmp(reg, label) {
  assert.equal(arguments.length, 2, 'Assembler: `farjmp` takes 2 arguments');
  assert(REGS[reg] !== undefined, `Assembler: unknown register ${reg}`);

  if (typeof label === 'string')
    label = this.label(label);

  if (label.pc === null) {
    label.farjumps.push({
      reg: reg,
      buffer: this.buffer.skip(6)
    });
    return;
  }

  this.movi(reg, label.pc);
  this.jalr('r0', reg);
};

Assembler.prototype.movi = function movi(reg, imm) {
  assert.equal(arguments.length, 2, 'Assembler: `movi` takes 2 arguments');
  assert(REGS[reg] !== undefined, `Assembler: unknown register ${reg}`);
  assert.equal(typeof imm, 'number', 'Assembler: `movi` expects immediate');

  assert(0 <= imm && imm <= 0xffff, 'Assembler: movi immediate overflow');
  this.lui(reg, imm >> 6);
  this.addi(reg, reg, imm & 0x3f);
};

Assembler.prototype.nop = function nop() {
  assert.equal(arguments.length, 0, 'Assembler: `nop` takes no arguments');

  this.add('r0', 'r0', 'r0');
};

// Assembly

Assembler.prototype.add = function add(a, b, c) {
  assert.equal(arguments.length, 3, 'Assembler: `add` takes 3 arguments');
  assert(REGS[a] !== undefined, `Assembler: unknown register ${a}`);
  assert(REGS[b] !== undefined, `Assembler: unknown register ${b}`);
  assert(REGS[c] !== undefined, `Assembler: unknown register ${c}`);

  this.buffer.writeUInt16BE((REGS[a] << 10) | (REGS[b] << 7) | REGS[c]);
};

Assembler.prototype.addi = function addi(a, b, imm) {
  assert.equal(arguments.length, 3, 'Assembler: `addi` takes 3 arguments');
  assert(REGS[a] !== undefined, `Assembler: unknown register ${a}`);
  assert(REGS[b] !== undefined, `Assembler: unknown register ${b}`);
  assert.equal(typeof imm, 'number', 'Assembler: `addi` expects immediate');

  assert(-64 <= imm && imm <= 63, 'Assembler: addi immediate overflow');
  this.buffer.writeUInt16BE(
      (0x1 << 13) | (REGS[a] << 10) | (REGS[b] << 7) | ((imm >>> 0) & 0x7f));
};

Assembler.prototype.nand = function nand(a, b, c) {
  assert.equal(arguments.length, 3, 'Assembler: `nand` takes 3 arguments');
  assert(REGS[a] !== undefined, `Assembler: unknown register ${a}`);
  assert(REGS[b] !== undefined, `Assembler: unknown register ${b}`);
  assert(REGS[c] !== undefined, `Assembler: unknown register ${c}`);

  this.buffer.writeUInt16BE(
      (0x2 << 13) | (REGS[a] << 10) | (REGS[b] << 7) | REGS[c]);
};

Assembler.prototype.lui = function lui(a, imm) {
  assert.equal(arguments.length, 2, 'Assembler: `lui` takes 2 arguments');
  assert(REGS[a] !== undefined, `Assembler: unknown register ${a}`);
  assert.equal(typeof imm, 'number', 'Assembler: `lui` expects immediate');

  assert(0 <= imm && imm <= 0x3ff, 'Assembler: lui immediate overflow');
  this.buffer.writeUInt16BE(
      (0x3 << 13) | (REGS[a] << 10) | ((imm >>> 0) & 0x3ff));
};

Assembler.prototype.sw = function sw(a, b, imm) {
  assert.equal(arguments.length, 3, 'Assembler: `sw` takes 3 arguments');
  assert(REGS[a] !== undefined, `Assembler: unknown register ${a}`);
  assert(REGS[b] !== undefined, `Assembler: unknown register ${b}`);
  assert.equal(typeof imm, 'number', 'Assembler: `sw` expects immediate');

  assert(-64 <= imm && imm <= 63, 'Assembler: `sw` immediate overflow');
  this.buffer.writeUInt16BE(
      (0x4 << 13) | (REGS[a] << 10) | (REGS[b] << 7) | ((imm >>> 0) & 0x7f));
};

Assembler.prototype.lw = function lw(a, b, imm) {
  assert.equal(arguments.length, 3, 'Assembler: `lw` takes 3 arguments');
  assert(REGS[a] !== undefined, `Assembler: unknown register ${a}`);
  assert(REGS[b] !== undefined, `Assembler: unknown register ${b}`);
  assert.equal(typeof imm, 'number', 'Assembler: `lw` expects immediate');

  assert(-64 <= imm && imm <= 63, 'Assembler: `lw` immediate overflow');
  this.buffer.writeUInt16BE(
      (0x5 << 13) | (REGS[a] << 10) | (REGS[b] << 7) | ((imm >>> 0) & 0x7f));
};

Assembler.prototype.beq = function beq(a, b, imm) {
  assert.equal(arguments.length, 3, 'Assembler: `beq` takes 3 arguments');
  assert(REGS[a] !== undefined, `Assembler: unknown register ${a}`);
  assert(REGS[b] !== undefined, `Assembler: unknown register ${b}`);
  assert.equal(typeof imm, 'number', 'Assembler: `beq` expects immediate');

  assert(-64 <= imm && imm <= 63, 'Assembler: `beq` immediate overflow');
  this.buffer.writeUInt16BE(
      (0x6 << 13) | (REGS[a] << 10) | (REGS[b] << 7) | ((imm >>> 0) & 0x7f));
};

Assembler.prototype.jalr = function jalr(a, b) {
  assert.equal(arguments.length, 2, 'Assembler: `jalr` takes 2 arguments');
  assert(REGS[a] !== undefined, `Assembler: unknown register ${a}`);
  assert(REGS[b] !== undefined, `Assembler: unknown register ${b}`);

  this.buffer.writeUInt16BE((0x7 << 13) | (REGS[a] << 10) | (REGS[b] << 7));
};

Assembler.prototype.irq = function irq(type) {
  assert.equal(arguments.length, 1, 'Assembler: `irq` takes 1 argument');
  assert(IRQ[type] !== undefined, `Assembler: unknown irq type "${type}"`);
  this.buffer.writeUInt16BE((0x7 << 13) | (IRQ[type] << 7) | 1);
};
