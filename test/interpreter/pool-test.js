'use strict';

const assert = require('assert');
const Buffer = require('buffer').Buffer;
const WBuf = require('wbuf');

const hackchain = require('../../');
const Interpreter = hackchain.Interpreter;
const Assembler = Interpreter.Assembler;

describe('Interpreter/Pool', () => {
  let interpreter;

  beforeEach(() => {
    interpreter = new Interpreter.Pool(4);
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
});
