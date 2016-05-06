'use strict';

const debug = require('debug')('hc:interpreter:pool');

const path = require('path');
const fork = require('child_process').fork;

function InterpreterPool(maxCount) {
  this.maxCount = maxCount;
  this.free = new Set();
  this.busy = new Set();
  this.tasks = new Map();

  this.queue = [];

  for (let i = 0; i < maxCount; i++)
    this.respawn();
}
module.exports = InterpreterPool;

InterpreterPool.prototype.respawn = function respawn() {
  if (this.free.size + this.busy.size >= this.maxCount)
    return null;

  const worker = fork(path.join(__dirname, 'worker.js'));
  debug('spawn %d', worker.pid);
  worker.once('exit', () => {
    debug('die %d', worker.pid);
    const task = this.tasks.get(worker);

    this.busy.delete(worker);
    this.free.delete(worker);
    this.tasks.delete(worker);

    const next = this.respawn();
    if (task)
      this.run(task.data, task.callback);
  });
  this.free.add(worker);

  return worker;
};

InterpreterPool.prototype.run = function run(data, callback) {
  if (this.free.size === 0)
    return this.queue.push(() => { this.run(data, callback); });

  const worker = this.free.entries().next().value[0];
  this.tasks.set(worker, { data: data, callback: callback });
  this.free.delete(worker);
  this.busy.add(worker);

  const done = (err, result) => {
    this.tasks.delete(worker);
    this.busy.delete(worker);
    this.free.add(worker);

    const next = this.queue.shift();
    if (next)
      next();

    callback(err, result);
  }

  worker.send({
    hash: data.hash.toString('hex'),
    input: data.input.toString('hex'),
    output: data.output.toString('hex')
  });

  worker.once('message', (data) => {
    if (data.error)
      return done(new Error(data.error), data.result);

    done(null, data.result);
  });
};
