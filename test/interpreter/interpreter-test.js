'use strict';

const assert = require('assert');
const Buffer = require('buffer').Buffer;
const WBuf = require('wbuf');

const hackchain = require('../../');
const Interpreter = hackchain.Interpreter;
const Assembler = Interpreter.Assembler;

describe('Interpreter', () => {
  let interpreter;

  beforeEach(() => {
    interpreter = new Interpreter();
  });

  afterEach(() => {
    interpreter = null;
  });

  function genCode(body) {
    const asm = new Assembler();
    body(asm);
    const buf = new WBuf();
    asm.render(buf);
    return Buffer.concat(buf.render());
  }

  function test(name, output, input, check) {
    it(name, (done) => {
      interpreter.run({
        hash: hackchain.constants.genesis,
        input: genCode(input),
        output: genCode(output)
      }, (err, success) => {
        if (err)
          return done(err);

        if (!check)
          assert(success);
        else
          check(success, interpreter);

        done();
      });
    });
  }

  test('unconditional success', (asm) => {
    asm.irq('success');
  }, (asm) => {
    asm.irq('failure');
  });

  test('unconditional failure', (asm) => {
    asm.irq('failure');
  }, (asm) => {
    asm.irq('failure');
  }, (success) => {
    assert(!success);
  });

  test('timing out output', (asm) => {
    asm.beq('r0', 'r0', -1);
  }, (asm) => {
    asm.irq('failure');
  });

  test('yield success (setting value)', (asm) => {
    asm.irq('yield');
    asm.movi('r1', 0x123);
    asm.irq('success');
  }, (asm) => {
    asm.movi('r2', 0x456);
    asm.irq('success');
  }, (success, interpreter) => {
    assert(success);

    assert.equal(interpreter.threads.output.regs[1], 0x123);
    assert.equal(interpreter.threads.input.regs[2], 0x456);
  });

  test('modifying memory', (asm) => {
    asm.irq('yield');
    asm.nop();
    asm.nop();
    asm.nop();
    asm.nop();
    asm.nop();
    asm.nop();
    asm.nop();
    // halt
    asm.beq('r0', 'r0', -1);
    asm.irq('success');
  }, (asm) => {
    asm.movi('r1', 0x1000);
    asm.sw('r0', 'r1', 0x8);
    asm.irq('success');
  }, (success, interpreter) => {
    assert(success);
    assert.equal(interpreter.memory.readUInt16LE(0x2000 + 0x10), 0);
  });
});
