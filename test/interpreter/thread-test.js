'use strict';

const assert = require('assert');
const Buffer = require('buffer').Buffer;
const WBuf = require('wbuf');

const hackchain = require('../../');
const Interpreter = hackchain.Interpreter;
const Assembler = Interpreter.Assembler;
const Thread = Interpreter.Thread;

describe('Interpreter/Thread', () => {
  let asm;
  let memory;
  let thread;

  beforeEach(() => {
    asm = new Assembler();
    memory = Buffer.alloc(0x20000);
    thread = new Thread(memory, 0x0);
  });

  afterEach(() => {
    asm = null;
    memory = null;
    thread = null;
  });

  function test(name, body, check) {
    it(name, () => {
      body(asm);
      const buf = new WBuf();
      asm.render(buf);
      const contents = Buffer.concat(buf.render());
      contents.copy(memory);

      while (!thread.isDone())
        thread.runOne();

      if (!check)
        assert(thread.isSuccess());
      else
        check(thread);
    });
  }

  describe('irq', () => {
    test('it should support SUCCESS', (asm) => {
      asm.irq('success');
    });

    test('it should support YIELD', (asm) => {
      asm.irq('yield');
    }, (thread) => {
      assert(thread.isYield());
    });

    test('it should support FAILURE', (asm) => {
      asm.irq('failure');
    }, (thread) => {
      assert(thread.isFailure());
    });
  });

  describe('addi', () => {
    test('it should not change value of `r0`', (asm) => {
      asm.addi('r0', 'r0', 1);
      asm.irq('success');
    }, (thread) => {
      assert.equal(thread.regs[0], 0);
    });

    test('it should change value of `r1`', (asm) => {
      asm.addi('r1', 'r0', 1);
      asm.irq('success');
    }, (thread) => {
      assert.equal(thread.regs[1], 1);
    });

    test('it should underflow value of `r1`', (asm) => {
      asm.addi('r1', 'r0', -1);
      asm.irq('success');
    }, (thread) => {
      assert.equal(thread.regs[1], 0xffff);
    });
  });

  describe('add', () => {
    test('it should not change value of `r0`', (asm) => {
      asm.addi('r1', 'r0', 1);
      asm.add('r0', 'r0', 'r1');
      asm.irq('success');
    }, (thread) => {
      assert.equal(thread.regs[0], 0);
    });

    test('it should change value of `r1`', (asm) => {
      asm.addi('r1', 'r0', 1);
      asm.add('r1', 'r1', 'r1');
      asm.irq('success');
    }, (thread) => {
      assert.equal(thread.regs[1], 2);
    });

    test('it should overflow value of `r1`', (asm) => {
      asm.addi('r1', 'r0', -1);
      asm.add('r1', 'r1', 'r1');
      asm.irq('success');
    }, (thread) => {
      assert.equal(thread.regs[1], 0xfffe);
    });
  });

  describe('nand', () => {
    test('it should not change value of `r0`', (asm) => {
      asm.nand('r0', 'r0', 'r0');
      asm.irq('success');
    }, (thread) => {
      assert.equal(thread.regs[0], 0);
    });

    test('it should change value of `r1`', (asm) => {
      asm.addi('r2', 'r0', 0x31);
      asm.addi('r3', 'r0', 0x13);
      asm.nand('r1', 'r2', 'r3');
      asm.irq('success');
    }, (thread) => {
      assert.equal(thread.regs[1], 0xffee);
    });
  });

  describe('lui', () => {
    test('it should not change value of `r0`', (asm) => {
      asm.lui('r0', 1);
      asm.irq('success');
    }, (thread) => {
      assert.equal(thread.regs[0], 0);
    });

    test('it should change value of `r1`', (asm) => {
      asm.lui('r1', 135);
      asm.irq('success');
    }, (thread) => {
      assert.equal(thread.regs[1], 0x21c0);
    });
  });

  describe('sw', () => {
    test('it should change memory', (asm) => {
      asm.lui('r1', 135);
      asm.sw('r1', 'r0', 14);
      asm.irq('success');
    }, (thread) => {
      assert.equal(memory.readUInt16LE(28), 0x21c0);
    });
  });

  describe('lw', () => {
    test('it should not change value of `r0`', (asm) => {
      asm.lui('r1', 135);
      asm.sw('r1', 'r0', 14);
      asm.lw('r0', 'r0', 14);
      asm.irq('success');
    }, (thread) => {
      assert.equal(thread.regs[0], 0);
    });

    test('it should change value of `r1`', (asm) => {
      asm.lui('r1', 135);
      asm.sw('r1', 'r0', 14);
      asm.add('r1', 'r0', 'r0');

      asm.lw('r1', 'r0', 14);
      asm.irq('success');
    }, (thread) => {
      assert.equal(thread.regs[1], 0x21c0);
    });
  });

  describe('beq', () => {
    test('it should jump if equal', (asm) => {
      asm.beq('r0', 'r0', 1);
      asm.irq('failure');

      asm.irq('success');
    });

    test('it should not jump if not equal', (asm) => {
      asm.addi('r1', 'r0', 1);
      asm.beq('r0', 'r1', 1);
      asm.irq('success');

      asm.irq('failure');
    });
  });

  describe('jalr', () => {
    test('it should jump and link', (asm) => {
      asm.addi('r2', 'r2', 3);
      asm.jalr('r1', 'r2');
      asm.irq('failure');

      asm.irq('success');
    }, (thread) => {
      assert(thread.isSuccess());
      assert.equal(thread.regs[1], 2);
    });
  });

  // Some masm stuff

  describe('movi', () => {
    test('it should set 16-bit immediate value', (asm) => {
      asm.movi('r1', 0xf358);
      asm.irq('success');
    }, (thread) => {
      assert(thread.isSuccess());
      assert.equal(thread.regs[1], 0xf358);
    });
  });
});
