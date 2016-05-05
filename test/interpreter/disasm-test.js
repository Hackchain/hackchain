'use strict';

const assert = require('assert');
const Buffer = require('buffer').Buffer;
const WBuf = require('wbuf');
const OBuf = require('obuf');

const hackchain = require('../../');
const Interpreter = hackchain.Interpreter;
const Assembler = Interpreter.Assembler;
const Disassembler = Interpreter.Disassembler;

describe('Interpreter/Disassembler', () => {
  let asm;

  beforeEach(() => {
    asm = new Assembler();
  });

  afterEach(() => {
    asm = null;
  });

  function check(expected) {
    const wbuf = new WBuf();
    asm.render(wbuf);

    const code = Buffer.concat(wbuf.render());
    const obuf = new OBuf();
    obuf.push(code);

    const disasm = new Disassembler(obuf);
    assert.deepEqual(disasm.run(), expected);
  }

  it('should parse `add`', () => {
    asm.add('r1', 'r2', 'r3');
    check([ { type: 'add', a: 1, b: 2, c: 3 } ]);
  });

  it('should parse `invalid-add`', () => {
    asm.buffer.writeUInt16BE(0x0008);
    check([ { type: '<invalid add>' } ]);
  });

  it('should parse positive `addi`', () => {
    asm.addi('r1', 'r2', 0x23);
    check([ { type: 'addi', a: 1, b: 2, imm: 0x23 } ]);
  });

  it('should parse negative `addi`', () => {
    asm.addi('r1', 'r2', -0x23);
    check([ { type: 'addi', a: 1, b: 2, imm: -0x23 } ]);
  });

  it('should parse `nand`', () => {
    asm.nand('r1', 'r2', 'r3');
    check([ { type: 'nand', a: 1, b: 2, c: 3 } ]);
  });

  it('should parse `invalid-nand`', () => {
    asm.buffer.writeUInt16BE(0x4008);
    check([ { type: '<invalid nand>' } ]);
  });

  it('should parse `lui`', () => {
    asm.lui('r1', 0x300);
    check([ { type: 'lui', a: 1, imm: 0x300 } ]);
  });

  it('should parse `sw`', () => {
    asm.sw('r1', 'r2', 0x23);
    check([ { type: 'sw', a: 1, b: 2, imm: 0x23 } ]);
  });

  it('should parse `lw`', () => {
    asm.lw('r1', 'r2', 0x23);
    check([ { type: 'lw', a: 1, b: 2, imm: 0x23 } ]);
  });

  it('should parse `beq`', () => {
    asm.beq('r1', 'r2', 0x23);
    check([ { type: 'beq', a: 1, b: 2, imm: 0x23 } ]);
  });

  it('should parse `jalr`', () => {
    asm.jalr('r1', 'r2');
    check([ { type: 'jalr', a: 1, b: 2 } ]);
  });

  it('should parse `invalid-jalr`', () => {
    asm.buffer.writeUInt16BE(0xe002);
    check([ { type: '<invalid jalr>' } ]);
  });

  it('should parse `irq(SUCCESS)`', () => {
    asm.irq('success');
    check([ { type: 'irq', cmd: 'success' } ]);
  });

  it('should parse `irq(YIELD)`', () => {
    asm.irq('yield');
    check([ { type: 'irq', cmd: 'yield' } ]);
  });

  it('should parse `irq(FAILURE)`', () => {
    asm.irq('failure');
    check([ { type: 'irq', cmd: 'failure' } ]);
  });

  it('should zero-pad', () => {
    asm.buffer.writeUInt8(0);
    check([ { type: 'add', a: 0, b: 0, c: 0 } ]);
  });
});
