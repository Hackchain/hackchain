'use strict';

const hackchain = require('../hackchain');

const BN = require('bn.js');
const Buffer = require('buffer').Buffer;
const WBuf = require('wbuf');

exports.empty = Buffer.alloc(32);
exports.genesis = exports.empty;

// 1 hcoin = 100000000 hatoshi
exports.coinbase = new BN(25 * 100000000);

function genCode(body) {
  const asm = new hackchain.Interpreter.Assembler();
  body(asm);
  const buf = new WBuf();
  asm.render(buf);
  return Buffer.concat(buf.render());
}
exports.coinbaseScript = genCode((asm) => {
  asm.irq('success');
});
