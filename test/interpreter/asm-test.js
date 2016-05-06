'use strict';

const assert = require('assert');
const Buffer = require('buffer').Buffer;
const WBuf = require('wbuf');

const hackchain = require('../../');
const Interpreter = hackchain.Interpreter;
const Assembler = Interpreter.Assembler;

describe('Interpreter/Assembler', () => {
  let asm;

  beforeEach(() => {
    asm = new Assembler();
  });

  afterEach(() => {
    asm = null;
  });

  function check(expected) {
    const buf = new WBuf();
    asm.render(buf);
    const contents = Buffer.concat(buf.render()).toString('hex');
    assert.equal(contents, expected);
  }

  it('should generate `add`', () => {
    asm.add('r1', 'r2', 'r3');
    check('0503');
  });

  it('should generate positive `addi`', () => {
    asm.addi('r1', 'r2', 0x23);
    check('2523');
  });

  it('should generate negative `addi`', () => {
    asm.addi('r1', 'r2', -0x23);
    check('255d');
  });

  it('should check range of immediate in `addi`', () => {
    assert.throws(() => {
      asm.addi('r1', 'r2', -10000);
    });
    assert.throws(() => {
      asm.addi('r1', 'r2', 10000);
    });
  });

  it('should generate `nand`', () => {
    asm.nand('r1', 'r2', 'r3');
    check('4503');
  });

  it('should generate `lui`', () => {
    asm.lui('r1', 0x300);
    check('6700');
  });

  it('should check range of immediate in `lui`', () => {
    assert.throws(() => {
      asm.lui('r1', 0x3000);
    });
    assert.throws(() => {
      asm.lui('r1', -0x3000);
    });
  });

  it('should generate `sw`', () => {
    asm.sw('r1', 'r2', 0x23);
    check('8523');
  });

  it('should generate `lw`', () => {
    asm.lw('r1', 'r2', 0x23);
    check('a523');
  });

  it('should generate `beq`', () => {
    asm.beq('r1', 'r2', 0x23);
    check('c523');
  });

  it('should generate `jalr`', () => {
    asm.jalr('r1', 'r2');
    check('e500');
  });

  it('should generate `irq(SUCCESS)`', () => {
    asm.irq('success');
    check('e001');
  });

  it('should generate `irq(YIELD)`', () => {
    asm.irq('yield');
    check('e081');
  });

  it('should generate `irq(FAILURE)`', () => {
    asm.irq('failure');
    check('e101');
  });
});
