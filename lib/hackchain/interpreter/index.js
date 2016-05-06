'use strict';

const assert = require('assert');
const WBuf = require('wbuf');

function Interpreter() {
  this.memory = Buffer.alloc(Interpreter.memorySize);
  this.threads = { output: null, input: null };

  this.clear();
}
module.exports = Interpreter;

Interpreter.Pool = require('./pool');
Interpreter.Thread = require('./thread');
Interpreter.Assembler = require('./asm');
Interpreter.Disassembler = require('./disasm');

// Yes, we are damn fast!
Interpreter.maxInitTicks = 100 * 1024;
Interpreter.maxTicks = 1024 * 1024;

Interpreter.hashOffset = 0x0000;
Interpreter.outputOffset = 0x1000;
Interpreter.inputOffset = 0x2000;
// 0x10000 16-bit words
Interpreter.memorySize = 0x20000;

Interpreter.prototype.clear = function clear() {
  this.memory.fill(0);
  this.threads.output =
      new Interpreter.Thread(this.memory, Interpreter.outputOffset * 2);
  this.threads.input =
      new Interpreter.Thread(this.memory, Interpreter.inputOffset * 2);
};

Interpreter.prototype.prepareOutput = function prepareOutput(data) {
  // Just some TX dependent info
  // TODO(indutny): add raw tx, maybe?
  data.hash.copy(this.memory, Interpreter.hashOffset);

  assert(data.output.length <= 0x1000);
  data.output.copy(this.memory, Interpreter.outputOffset * 2);
};

Interpreter.prototype.prerunOneOutput = function prerunOneOutput() {
  const output = this.threads.output;

  output.runOne();
  if (output.isDone())
    return true;

  return false;
};

Interpreter.prototype.prerunOutput = function prerunOutput() {
  const maxIter = Interpreter.maxInitTicks;

  let i;
  for (i = 0; i < maxIter; i++)
    if (this.prerunOneOutput())
      break;

  this.threads.output.clearYield();

  return i !== maxIter;
};

Interpreter.prototype.prepareInput = function prepareInput(data) {
  // Do not let output overwrite input
  assert(data.input.length <= 0x1000);
  data.input.copy(this.memory, Interpreter.inputOffset * 2);
};

Interpreter.prototype.runOneBoth = function runOneBoth() {
  this.threads.output.runOne();
  if (!this.threads.input.isDone())
    this.threads.input.runOne();

  if (this.threads.output.isDone())
    return true;

  return false;
};

Interpreter.prototype.run = function run(data, callback) {
  this.prepareOutput(data);

  // If `output` times out - coin is captured
  if (!this.prerunOutput())
    return callback(null, true);

  if (this.threads.output.isDone())
    return callback(null, this.threads.output.isSuccess());

  this.prepareInput(data);

  for (var ticks = 0; ticks < Interpreter.maxTicks; ticks++)
    if (this.runOneBoth())
      break;

  callback(null, this.threads.output.isSuccess());
};
