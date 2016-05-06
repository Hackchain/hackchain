'use strict';

const assert = require('assert');
const blessed = require('blessed');
const Buffer = require('buffer').Buffer;
const OBuf = require('obuf');

const hackchain = require('../hackchain');
const Interpreter = hackchain.Interpreter;
const Disassembler = Interpreter.Disassembler;
const TX = hackchain.TX;

function Debugger(title, data) {
  assert(data && typeof data === 'object', 'Debugger: data must be an object');
  assert.equal(typeof data.hash, 'string',
               'Debugger: `data.hash` must be a string');
  assert(Array.isArray(data.output),
         'Debugger: `data.output` must be an Array');
  assert(Array.isArray(data.input),
         'Debugger: `data.input` must be an Array');

  this.data = {
    hash: Buffer.from(data.hash, 'hex'),
    output: TX.Script.compileTextArray(data.output).opcodes,
    input: TX.Script.compileTextArray(data.input).opcodes
  };

  this.interpreter = new Interpreter();
  this.state = 'output';
  this.counter = 0;

  this.initUI(title);
}
module.exports = Debugger;

Debugger.prototype.run = function run() {
  this.restart();
};

Debugger.prototype.restart = function restart() {
  this.state = 'output';
  this.counter = 0;

  this.interpreter.clear();
  this.interpreter.prepareOutput(this.data);

  this.update();
};

Debugger.prototype.exit = function exit() {
  process.exit(0);
};

Debugger.prototype.step = function step() {
  if (this.state === 'output') {
    this._stepOutput();
  } else if (this.state === 'both') {
    this._stepBoth();
  } else {
    // ...failure
  }

  this.update();
};

Debugger.prototype._stepOutput = function _stepOutput() {
  if (!this.interpreter.prerunOneOutput()) {
    this.counter++;
    if (this.counter >= Interpreter.maxInitTicks)
      this.finish(false);

    return;
  }

  // TODO(indutny): should be a function of interpreter
  this.interpreter.threads.output.clearYield();

  if (this.interpreter.threads.output.isDone())
    return this.finish(this.interpreter.threads.output.isSuccess());

  this.interpreter.prepareInput(this.data);
  this.counter = 0;
  this.state = 'both';
};

Debugger.prototype._stepBoth = function _stepBoth() {
  if (!this.interpreter.runOneBoth()) {
    this.counter++;
    if (this.counter >= Interpreter.maxTicks)
      this.finish(false);
    return;
  }

  this.finish(this.interpreter.threads.output.isSuccess());
};

Debugger.prototype.finish = function finish(result) {
  this.state = result ? 'success' : 'failure';
  this.counter = 0;
};

Debugger.prototype.update = function update() {
  this.updateThread(this.output, this.interpreter.threads.output);
  this.updateThread(this.input, this.interpreter.threads.input);

  this.screen.render();
};

Debugger.prototype.updateThread = function updateThread(box, thread) {
  const contextBefore = (box.height - 1) >> 1;
  const contextAfter = box.height - 1 - contextBefore;

  const start = thread.pc - 2 * contextBefore;
  const end = thread.pc + 2 * contextAfter;

  const code = this.interpreter.memory.slice(start, end);
  const buf = new OBuf();
  buf.push(code);

  const disasm = new Disassembler(buf);
  let lines = Disassembler.stringify(disasm.run()).split('\n');

  const addr = (i) => {
    let r = i.toString(16);
    if (r.length === 1)
      return `0x000${r}`;
    else if (r.length === 2)
      return `0x00${r}`;
    else if (r.length === 3)
      return `0x0${r}`;
    else if (r.length === 4)
      return `0x${r}`;
    return '0x....';
  };

  lines = lines.map((line, i) => {
    return `${addr((start >> 1) + i)}: ${line}`;
  });

  box.setItems(lines);
  box.select(contextBefore);

  if (this.state === 'success')
    box.style.selected.bg = 'green';
  else if (this.state === 'failure')
    box.style.selected.bg = 'red';
  else
    box.style.selected.bg = 'grey';
};

//
// UI - Can be separated later
//

Debugger.prototype.initUI = function initUI(title) {
  this.screen = blessed.screen({
    smartCSR: true
  });
  this.screen.title = `HC debug - "${title}"`;

  this.initMenu();

  const codeStyle = {
    selected: {
      fg: 'white',
      bg: 'blue'
    }
  };

  this.output = blessed.list({
    top: 1,
    left: '0%',
    width: '50%',
    tags: true,
    label: 'Output',
    border: { type: 'line' },
    style: codeStyle
  });

  this.input = blessed.list({
    top: 1,
    left: '50%',
    width: '50%',
    tags: true,
    label: 'Input',
    border: { type: 'line' },
    style: codeStyle
  });

  this.initHotkeys();

  this.screen.append(this.menu);
  this.screen.append(this.output);
  this.screen.append(this.input);
};

Debugger.prototype.initMenu = function initMenu() {
  this.menu = blessed.listbar({
    top: '0%',
    left: '0%',
    width: '100%',
    height: 1,
    style: {
      bg: 'lightgrey',
      item: {
        bg: 'lightgrey'
      },
      selected: {
        bg: 'lightgrey'
      }
    }
  });

  this.menu.addItem('Exit (q)', () => {
    this.exit();
  });

  this.menu.addItem('Step (F10)', () => {
    this.step();
  });

  this.menu.addItem('Restart (F5)', () => {
    this.restart();
  });
};

Debugger.prototype.initHotkeys = function initHotkeys() {
  this.screen.key([ 'q', 'C-c' ], () => {
    this.exit();
  });

  this.screen.key([ 'f10', 'f11' ], () => {
    this.step();
  });

  this.screen.key([ 'f5' ], () => {
    this.restart();
  });
};
