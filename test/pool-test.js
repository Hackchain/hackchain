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
const coinbase = hackchain.constants.coinbase;

const fixtures = require('./fixtures');

describe('Pool', () => {
  let chain;
  let pool;

  const feeTX = (block, fee) => {
    const tx = new TX();

    tx.input(block.txs[0].hash(), 0, new Script());
    tx.output(new BN(block.txs[0].outputs[0].value.sub(fee)), new Script());

    return tx;
  }

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
        interval: 0,
        coinbaseInterval: 0
      });

      pool.mint(coinbase, done);
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

    pool.mint(coinbase, (err) => {
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
        pool.mint(coinbase, callback);
      },
      (block, callback) => {
        assert.equal(block.txs.length, 2);

        // Coinbase
        assert.equal(block.txs[0].outputs.length, 1);
        assert.deepEqual(block.txs[0].outputs[0].script.opcodes,
                        hackchain.constants.coinbaseScript);
        assert.equal(block.txs[0].outputs[0].value.toString(),
                     coinbase.muln(2).isubn(1));

        // TX
        assert.deepEqual(block.txs[1].hash(), tx.hash());

        callback(null);
      }
    ], done);
  });

  it('should sort TXs using fee', (done) => {
    async.waterfall([
      (callback) => {
        async.timesSeries(3, (i, callback) => {
          pool.mint(coinbase, callback);
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
        pool.mint(coinbase, callback);
      },
      (block, callback) => {
        assert.equal(block.txs.length, 4);

        const fees = [];
        for (let i = 1; i < block.txs.length; i++) {
          const output = block.txs[i].outputs[0].value;
          fees.push(coinbase.sub(output).toNumber());
        }

        assert.deepEqual(fees, [ 3, 2, 1 ]);

        callback(null);
      }
    ], done);
  });

  it('should evict TX using fee', (done) => {
    async.waterfall([
      (callback) => {
        async.timesSeries(4, (i, callback) => {
          pool.mint(coinbase, callback);
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
        pool.mint(coinbase, callback);
      },
      (block, callback) => {
        assert.equal(block.txs.length, 4);

        const fees = [];
        for (let i = 1; i < block.txs.length; i++) {
          const output = block.txs[i].outputs[0].value;
          fees.push(coinbase.sub(output).toNumber());
        }

        assert.deepEqual(fees, [ 5, 3, 2 ]);

        callback(null);
      }
    ], done);
  });

  it('should not accept TX with low fee', (done) => {
    async.waterfall([
      (callback) => {
        async.timesSeries(4, (i, callback) => {
          pool.mint(coinbase, callback);
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
        }, (err) => {
          callback(err, blocks[3]);
        });
      },
      (block, callback) => {
        const tx = feeTX(block, new BN(0));

        pool.accept(tx, (err) => {
          assert(err);
          assert(/Fee is too low/.test(err.message));
          callback(null);
        });
      }
    ], done);
  });

  it('should not accept double-spend TX', (done) => {
    async.waterfall([
      (callback) => {
        pool.mint(coinbase, callback);
      },
      (block, callback) => {
        const tx = feeTX(block, new BN(0));
        pool.accept(tx, (err) => {
          callback(err, tx);
        });
      },
      (tx, callback) => {
        pool.accept(tx, (err) => {
          assert(err);
          assert(/Double-spend attempt/.test(err.message));
          callback(null, tx);
        });
      },
      (tx, callback) => {
        pool.mint(coinbase, (err, block) => {
          callback(err, block, tx);
        });
      },
      (block, tx, callback) => {
        pool.accept(tx, (err) => {
          assert(err);
          assert(/Double-spend attempt/.test(err.message));
          callback(null);
        });
      }
    ], done);
  });

  it('should not accept TX with failing script', (done) => {
    async.waterfall([
      (callback) => {
        pool.mint(coinbase, callback);
      },
      (block, callback) => {
        const tx = feeTX(block, new BN(0));
        pool.accept(tx, (err) => {
          callback(err, tx);
        });
      },
      (tx, callback) => {
        pool.mint(coinbase, (err, block) => {
          callback(err, block, tx);
        });
      },
      (block, tx, callback) => {
        const invalid = new TX();
        invalid.input(tx.hash(), 0, new Script());
        invalid.output(tx.outputs[0].value, new Script());

        pool.accept(invalid, (err) => {
          assert(err);
          assert(/failed to capture/.test(err.message));
          callback(null);
        });
      }
    ], done);
  });

  it('should not accept big TX', (done) => {
    async.waterfall([
      (callback) => {
        pool.mint(coinbase, callback);
      },
      (block, callback) => {
        const tx = new TX();
        tx.output(new BN(1), new Script(Buffer.alloc(128 * 1024)));

        pool.accept(tx, (err) => {
          assert(err);
          assert(/too big/.test(err.message));
          callback(null);
        });
      }
    ], done);
  });
});
