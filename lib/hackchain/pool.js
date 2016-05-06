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

const poolTXCompare = (a, b) => {
  // Highest fee - first
  return b.fee.cmp(a.fee);
};

Pool.prototype.accept = function accept(tx, callback) {
  const hash = tx.hash().toString('hex');
  debug('verify tx=%s', hash);

  async.parallel({
    verify: (callback) => {
      tx.verify(this.chain, callback);
    },
    fee: (callback) => {
      tx.getFee(this.chain, callback);
    }
  }, (err, data) => {
    if (err) {
      debug('verify tx=%s failure', hash);

      return callback(err);
    }

    debug('verify tx=%s success', hash);

    assert(data.verify, 'Sanity check');

    if (this.txs.length === this.size) {
      debug('accept tx=%s full pool', hash);

      this.evict(data.fee, (err) => {
        if (err) {
          debug('accept tx=%s can\'t evict', hash);
          return callback(err);
        }

        debug('accept tx=%s', hash);

        this.insertTX(tx, data.fee);
        callback(null);
      });
      return;
    }

    debug('accept tx=%s', hash);

    this.insertTX(tx, data.fee);
    callback(null);
  });
};

Pool.prototype.insertTX = function insertTX(tx, fee) {
  const entry = { tx: tx, fee: fee };

  const index = hackchain.utils.binarySearch(this.txs, entry, poolTXCompare);
  this.txs.splice(index, 0, entry);
};

Pool.prototype.evict = function evict(fee, callback) {
  if (this.txs.length === 0)
    return callback(new Error('Pool: Empty tx list'));

  if (this.txs[this.txs.length - 1].fee.cmp(fee) >= 0)
    return callback(new Error('Pool: Fee is too low to fit into'));

  this.txs.pop();
  callback(null);
};

Pool.prototype.start = function start() {
  if (this.timer !== null)
    return;

  // Only manual `mint` with `0` interval
  if (this.timerInterval === 0)
    return;

  this.timer = setTimeout(() => {
    this.timer = null;
    this.mint(() => {
      this.start();
    });
  }, this.timerInterval);
};

Pool.prototype.mint = function mint(callback) {
  debug('mint');

  const txs = this.txs;
  this.txs = [];

  const block = new Block(this.chain.lastBlock);

  const coinbase = new TX();

  // Isn't checked, just to ensure that coinbase will have unique hash
  coinbase.input(this.chain.lastBlock, 0xffffffff, new TX.Script());

  let fees = new BN(0);
  for (let i = 0; i < txs.length; i++)
    fees.iadd(txs[i].fee);

  // coinbase.value = default + fees
  coinbase.output(hackchain.constants.coinbase.add(fees),
                  new TX.Script(hackchain.constants.coinbaseScript));

  debug('minted coinbase=%s value=%s',
        coinbase.hash().toString('hex'),
        coinbase.outputs[0].value.toString());

  block.addCoinbase(coinbase);

  for (let i = 0; i < txs.length; i++)
    block.addTX(txs[i].tx);

  const hash = block.hash().toString('hex');
  debug('storing block=%s', hash);

  this.chain.storeBlock(block, (err) => {
    // TODO(indutny): gracefully exit?
    if (err)
      throw err;

    debug('storing block=%s done', hash);
    callback(null, block);
  });
};
