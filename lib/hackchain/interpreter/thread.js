'use strict';

function Thread(pc, sc) {
  this.pc = pc;
  this.sc = sc;

  this.done = false;
}
module.exports = Thread;

Thread.prototype.prerun = function prerun(memory, maxIter) {
};

Thread.prototype.runOne = function runOne(memory) {
};

Thread.prototype.success = function success() {
  return true;
};
