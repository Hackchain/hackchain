'use strict';

const WBuf = require('wbuf');

function Interpreter() {
  this.memory = new Uint8Array(65536);

  this.threads = [
    new Interpreter.Thread(0x3000, 0x1000),
    new Interpreter.Thread(0x4000, 0x2000)
  ];
}
module.exports = Interpreter;

Interpreter.Thread = require('./thread');

// TODO(indutny): determine these based on actual speed
Interpreter.maxInitTicks = 256;
Interpreter.maxTicks = 16 * 1024;

Interpreter.prototype.run = function run(data, callback) {
  // Just some TX dependent info
  // TODO(indutny): consider adding more of it
  data.hash.copy(this.memory, 0x0000);

  data.output.opcodes.copy(this.memory, 0x3000);
  data.input.opcodes.copy(this.memory, 0x4000);

  this.thread[0].prerun(this.memory, Interpreter.maxInitTicks);
  if (this.thread[0].done)
    return callback(null, this.thread[0].success());

  for (var ticks = 0; ticks < Interpreter.maxTicks; ticks++) {
    this.thread[0].runOne(this.memory);
    this.thread[1].runOne(this.memory);

    if (this.thread[0].done || this.thread[1].done)
      return callback(null, this.thread[0].success());
  }

  callback(null, false);
};

Interpreter
