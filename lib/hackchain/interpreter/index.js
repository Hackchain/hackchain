'use strict';

const assert = require('assert');
const WBuf = require('wbuf');

function Interpreter() {
  // We are operating 16-bit words
  this.memory = Buffer.alloc(0x20000);
  this.memory.fill(0);

  this.threads = [
    new Interpreter.Thread(this.memory, 0x2000),
    new Interpreter.Thread(this.memory, 0x4000)
  ];
}
module.exports = Interpreter;

Interpreter.Pool = require('./pool');
Interpreter.Thread = require('./thread');
Interpreter.Assembler = require('./asm');
Interpreter.Disassembler = require('./disasm');

// Yes, we are damn fast!
Interpreter.maxInitTicks = 100 * 1024;
Interpreter.maxTicks = 1024 * 1024;

Interpreter.prototype.run = function run(data, callback) {
  // Just some TX dependent info
  // TODO(indutny): add raw tx, maybe?
  data.hash.copy(this.memory, 0x00);

  assert(data.output.length <= 0x1000);
  data.output.copy(this.memory, 0x2000);

  // If `output` times out - coin is captured
  if (!this.threads[0].prerun(Interpreter.maxInitTicks))
    return callback(null, true);

  if (this.threads[0].isDone())
    return callback(null, this.threads[0].isSuccess());

  // Do not let output overwrite input
  assert(data.input.length <= 0x1000);
  data.input.copy(this.memory, 0x4000);

  for (var ticks = 0; ticks < Interpreter.maxTicks; ticks++) {
    this.threads[0].runOne();
    if (!this.threads[1].isDone())
      this.threads[1].runOne();

    if (this.threads[0].isDone())
      return callback(null, this.threads[0].isSuccess());
  }

  callback(null, false);
};
