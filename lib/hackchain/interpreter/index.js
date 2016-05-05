'use strict';

const WBuf = require('wbuf');

function Interpreter() {
  // We are operating 16-bit words
  this.memory = Buffer.alloc(0x20000);
  this.memory.fill(0);

  this.threads = [
    new Interpreter.Thread(this.memory, 0x1000),
    new Interpreter.Thread(this.memory, 0x2000)
  ];
}
module.exports = Interpreter;

Interpreter.Thread = require('./thread');

// TODO(indutny): determine these based on actual speed
Interpreter.maxInitTicks = 0x100;
Interpreter.maxTicks = 0x4000;

Interpreter.prototype.run = function run(data, callback) {
  // Just some TX dependent info
  // TODO(indutny): add raw tx, maybe?
  data.hash.copy(this.memory, 0x00);

  data.output.opcodes.copy(this.memory, 0x1000);

  this.thread[0].prerun(this.memory, Interpreter.maxInitTicks);

  if (this.thread[0].isDone())
    return callback(null, this.thread[0].isSuccess());

  // Do not let output overwrite input
  data.input.opcodes.copy(this.memory, 0x2000);

  for (var ticks = 0; ticks < Interpreter.maxTicks; ticks++) {
    this.thread[0].runOne(this.memory);
    this.thread[1].runOne(this.memory);

    if (this.thread[0].isDone() || this.thread[1].isDone())
      return callback(null, this.thread[0].isSuccess());
  }

  callback(null, false);
};

Interpreter
