'use strict';

const assert = require('assert');
const async = require('async');
const crypto = require('crypto');
const Buffer = require('buffer').Buffer;
const BN = require('bn.js');
const WBuf = require('wbuf');
const OBuf = require('obuf');

const hackchain = require('../');
const TX = hackchain.TX;
const Block = hackchain.Block;
const Chain = hackchain.Chain;
const Pool = hackchain.Pool;
const Script = TX.Script;

const fixtures = require('./fixtures');

describe('Pool', () => {
  let chain;
  let pool;

  beforeEach((done) => {
    fixtures.removeDB();

    chain = new Chain(fixtures.dbPath, {
      workers: 1
    });
    chain.init((err) => {
      if (err)
        return done(err);

      pool = new Pool(chain, {
        size: 3,
        interval: 0
      });

      pool.mint(done);
    });
  });

  afterEach((done) => {
    chain.close(() => {
      fixtures.removeDB();
      done();
    });

    chain = null;
    pool = null;
  });

  it('should mint empty block', (done) => {
    const first = chain.lastBlock;

    pool.mint((err) => {
      if (err)
        return done(err);

      assert.notDeepEqual(chain.lastBlock, first);
      done();
    });
  });

  it('should allow spending coinbase and adding fee to coinbase', (done) => {
    const tx = new TX();

    async.waterfall([
      (callback) => {
        chain.getBlock(chain.lastBlock, callback);
      },
      (block, callback) => {
        tx.input(block.txs[0].hash(), 0, new Script());
        tx.output(new BN(1), new Script());

        callback(null, tx);
      },
      (tx, callback) => {
        pool.accept(tx, callback);
      },
      (callback) => {
        pool.mint(callback);
      },
      (block, callback) => {
        assert.equal(block.txs.length, 2);

        // Coinbase
        assert.equal(block.txs[0].outputs.length, 1);
        assert.deepEqual(block.txs[0].outputs[0].script.opcodes,
                        hackchain.constants.coinbaseScript);
        assert.equal(block.txs[0].outputs[0].value.toString(),
                     hackchain.constants.coinbase.muln(2).isubn(1));

        // TX
        assert.deepEqual(block.txs[1].hash(), tx.hash());

        callback(null);
      }
    ], done);
  });

  it('should sort TXs using fee', (done) => {
    function feeTX(block, fee) {
      const tx = new TX();

      tx.input(block.txs[0].hash(), 0, new Script());
      tx.output(new BN(block.txs[0].outputs[0].value.sub(fee)), new Script());

      return tx;
    }

    async.waterfall([
      (callback) => {
        async.timesSeries(3, (i, callback) => {
          pool.mint(callback);
        }, callback);
      },
      (blocks, callback) => {
        const txs = [
          feeTX(blocks[0], new BN(3)),
          feeTX(blocks[1], new BN(1)),
          feeTX(blocks[2], new BN(2))
        ];

        async.forEach(txs, (tx, callback) => {
          pool.accept(tx, callback);
        }, callback);
      },
      (callback) => {
        pool.mint(callback);
      },
      (block, callback) => {
        assert.equal(block.txs.length, 4);

        const fees = [];
        for (let i = 1; i < block.txs.length; i++) {
          const output = block.txs[i].outputs[0].value;
          fees.push(hackchain.constants.coinbase.sub(output).toNumber());
        }

        assert.deepEqual(fees, [ 3, 2, 1 ]);

        callback(null);
      }
    ], done);
  });

  it('should evict TX using fee', (done) => {
    function feeTX(block, fee) {
      const tx = new TX();

      tx.input(block.txs[0].hash(), 0, new Script());
      tx.output(new BN(block.txs[0].outputs[0].value.sub(fee)), new Script());

      return tx;
    }

    async.waterfall([
      (callback) => {
        async.timesSeries(4, (i, callback) => {
          pool.mint(callback);
        }, callback);
      },
      (blocks, callback) => {
        const txs = [
          feeTX(blocks[0], new BN(3)),
          feeTX(blocks[1], new BN(1)),
          feeTX(blocks[2], new BN(2)),
          feeTX(blocks[3], new BN(5))
        ];

        async.forEach(txs, (tx, callback) => {
          pool.accept(tx, callback);
        }, callback);
      },
      (callback) => {
        pool.mint(callback);
      },
      (block, callback) => {
        assert.equal(block.txs.length, 4);

        const fees = [];
        for (let i = 1; i < block.txs.length; i++) {
          const output = block.txs[i].outputs[0].value;
          fees.push(hackchain.constants.coinbase.sub(output).toNumber());
        }

        assert.deepEqual(fees, [ 5, 3, 2 ]);

        callback(null);
      }
    ], done);
  });
});
