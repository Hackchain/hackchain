'use strict';

const assert = require('assert');
const async = require('async');
const debug = require('debug')('hc:pool');
const BN = require('bn.js');

const hackchain = require('../hackchain');
const Block = hackchain.Block;
const TX = hackchain.TX;

function Pool(chain, options) {
  assert.equal(typeof options.size, 'number',
               'Pool: options.size not number');
  assert.equal(typeof options.interval, 'number',
               'Pool: options.interval not number');

  this.chain = chain;
  this.size = options.size;
  this.txs = [];

  this.timer = null;
  this.timerInterval = options.interval;
}
module.exports = Pool;

Pool.prototype.accept = function accept(tx, callback) {
  if (this.txs.length === this.size)
    return callback(new Error('Pool is full'));

  const hash = tx.hash().toString('hex');
  debug('verify tx=%s', hash);

  tx.verify(this.chain, (err, result) => {
    if (err) {
      debug('verify tx=%s failure', hash);

      return callback(err);
    }

    assert(result, 'Sanity check');

    if (this.txs.length === this.size) {
      debug('verify tx=%s full pool', hash);

      return callback(new Error('Pool is full'));
    }

    debug('verify tx=%s success', hash);

    this.txs.push(tx);
    callback(null);
  });
};

Pool.prototype.start = function start() {
  if (this.timer !== null)
    return;

  this.timer = setTimeout(() => {
    this.timer = null;
    this._onTimer(() => {
      this.start();
    });
  }, this.timerInterval);
};

Pool.prototype._onTimer = function _onTimer(callback) {
  debug('_onTimer');

  const txs = this.txs;
  this.txs = [];

  const block = new Block(this.chain.lastBlock);

  const coinbase = new TX();

  // Isn't checked, just to ensure that coinbase will have unique hash
  coinbase.input(this.chain.lastBlock, 0xffffffff, new TX.Script());

  async.map(txs, (tx, callback) => {
    tx.getFee(this.chain, callback);
  }, (err, fees) => {
    let fee = new BN(0);

    // Ignore errors
    if (Array.isArray(fees)) {
      for (let i = 0; i < fees.length; i++)
        fee.iadd(fees[i]);
    }

    // coinbase.value = default + fee
    coinbase.output(hackchain.constants.coinbase.add(fee),
                    new TX.Script(hackchain.constants.coinbaseScript));

    debug('minted coinbase=%s value=%s',
          coinbase.hash().toString('hex'),
          coinbase.outputs[0].value.toString());

    block.addCoinbase(coinbase);

    for (let i = 0; i < txs.length; i++)
      block.addTX(txs[i]);

    const hash = block.hash().toString('hex');
    debug('storing block=%s', hash);

    this.chain.storeBlock(block, (err) => {
      // TODO(indutny): gracefully exit?
      if (err)
        throw err;

      debug('storing block=%s done', hash);
      callback(null);
    });
  });
};
