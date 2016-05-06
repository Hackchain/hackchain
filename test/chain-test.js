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

const fixtures = require('./fixtures');

describe('Chain', () => {
  let chain;

  beforeEach((done) => {
    fixtures.removeDB();

    chain = new Chain(fixtures.dbPath, {
      workers: 1
    });
    chain.init(done);
  });

  afterEach((done) => {
    chain.close(() => {
      fixtures.removeDB();
      done();
    });

    chain = null;
  });

  it('should store/load block', (done) => {
    const b = new Block(hackchain.constants.empty);

    async.waterfall([
      (callback) => {
        chain.storeBlock(b, callback);
      },
      (callback) => {
        chain.getBlock(b.hash().toString('hex'), callback);
      },
      (block, callback) => {
        assert.equal(block.inspect(), b.inspect());
        chain.getRawBlock(b.hash().toString('hex'), callback);
      },
      (raw, callback) => {
        const buf = new WBuf();
        b.render(buf);
        assert.deepEqual(raw, Buffer.concat(buf.render()));
        callback(null);
      }
    ], done);
  });

  it('should store/load tx', (done) => {
    const tx = new TX();

    async.waterfall([
      (callback) => {
        chain.storeTX(tx, callback);
      },
      (callback) => {
        chain.getTX(tx.hash().toString('hex'), callback);
      },
      (tx2, callback) => {
        assert.equal(tx2.inspect(), tx.inspect());
        chain.getRawTX(tx.hash().toString('hex'), callback);
      },
      (raw, callback) => {
        const buf = new WBuf();
        tx.render(buf);
        assert.deepEqual(raw, Buffer.concat(buf.render()));
        callback(null);
      }
    ], done);
  });

  it('should verify coinbase-only block', (done) => {
    const block = new Block(hackchain.constants.genesis);
    const tx = new TX();

    tx.input(hackchain.constants.empty, 0, new TX.Script());
    tx.output(hackchain.constants.coinbase, new TX.Script());
    block.addCoinbase(tx);

    async.waterfall([
      (callback) => {
        chain.storeBlock(block, callback);
      },
      (callback) => {
        block.verify(chain, (err, result) => {
          assert.deepEqual(err, null);
          assert.deepEqual(result, true);
          callback(null);
        });
      },
      (callback) => {
        chain.getTXBlock(tx.hash(), (err, txBlock) => {
          assert.deepEqual(err, null);
          assert.deepEqual(txBlock, block.hash());

          callback(null);
        });
      },
      (callback) => {
        chain.getTXSpentBy(tx.inputs[0].hash, 0, (err, spentBy) => {
          assert.deepEqual(err, null);
          assert.deepEqual(spentBy, tx.hash());

          callback(null);
        });
      }
    ], done);
  });

  it('should report unspent TXs', (done) => {
    const b1 = new Block(hackchain.constants.genesis);
    const coinbase = new TX();

    coinbase.input(hackchain.constants.empty, 0, new TX.Script());
    coinbase.output(hackchain.constants.coinbase,
                    new TX.Script(hackchain.constants.coinbaseScript));
    b1.addCoinbase(coinbase);

    function emptyCoinbase(block) {
      const empty = new TX();

      empty.input(block.parent, 0, new TX.Script());
      empty.output(new BN(0), new TX.Script());
      block.addCoinbase(empty);
    }

    const b2 = new Block(b1.hash());
    emptyCoinbase(b2);

    const COUNT = 16;

    const fork = new TX();
    fork.input(coinbase.hash(), 0, new TX.Script());
    for (let i = 1; i <= COUNT; i++) {
      fork.output(new BN(i),
                  new TX.Script(hackchain.constants.coinbaseScript));
    }
    b2.addTX(fork);

    const b3 = new Block(b2.hash());
    emptyCoinbase(b3);

    function spendFork(i) {
      const tx = new TX();

      tx.input(fork.hash(), i, new TX.Script());
      tx.output(new BN(i + 1), new TX.Script());
      b3.addTX(tx);
    }

    for (let i = 0; i < COUNT; i++)
      spendFork(i);

    async.waterfall([
      (callback) => {
        async.forEachSeries([ b1, b2 ], (block, callback) => {
          chain.storeBlock(block, callback);
        }, callback);
      },
      (callback) => {
        chain.getUnspentTXs(Infinity, callback);
      },
      (txs, callback) => {
        assert.equal(txs.length, COUNT);
        for (let i = 0; i < COUNT; i++) {
          assert.deepEqual(txs[i].hash, fork.hash());
          assert.equal(txs[i].value.toNumber(), COUNT - i);
          assert.equal(txs[i].index, COUNT - i - 1);
        }
        callback(null);
      },
      (callback) => {
        chain.storeBlock(b3, callback);
      },
      (callback) => {
        chain.getUnspentTXs(Infinity, callback);
      },
      (txs, callback) => {
        assert.equal(txs.length, COUNT);
        for (let i = 0; i < COUNT; i++) {
          assert.notDeepEqual(txs[i].hash, fork.hash());
          assert.equal(txs[i].index, 0);
          assert.equal(txs[i].value.toNumber(), COUNT - i);
        }

        callback(null);
      }
    ], done);
  });

  it('should fail to verify block without parent', (done) => {
    const block = new Block(hackchain.constants.empty);

    async.parallel([
      (callback) => {
        chain.storeBlock(block, callback);
      }
    ], (err) => {
      if (err)
        return callback(err);

      block.verify(chain, (err, result) => {
        assert(err);
        assert.deepEqual(result, false);

        done();
      });
    });
  });

  it('should fail to verify block without coinbase', (done) => {
    const block = new Block(hackchain.constants.genesis);

    async.parallel([
      (callback) => {
        chain.storeBlock(block, callback);
      }
    ], (err) => {
      if (err)
        return callback(err);

      block.verify(chain, (err, result) => {
        assert(err);
        assert.deepEqual(result, false);

        done();
      });
    });
  });

  it('should fail to verify tx with negative fee', (done) => {
    const b1 = new Block(hackchain.constants.genesis);

    const coinbase = new TX();
    coinbase.input(hackchain.constants.empty, 0, new TX.Script());
    coinbase.output(hackchain.constants.coinbase,
                    new TX.Script(hackchain.constants.coinbaseScript));
    b1.addCoinbase(coinbase);

    const b2 = new Block(b1.hash());

    {
      const tx = new TX();
      tx.input(hackchain.constants.empty, 0, new TX.Script());
      tx.output(new BN(0), new TX.Script());
      b2.addCoinbase(tx);
    }

    {
      const tx = new TX();
      tx.input(coinbase.hash(), 0, new TX.Script());
      tx.output(hackchain.constants.coinbase.addn(1), new TX.Script());
      b2.addTX(tx);
    }

    async.forEachSeries([ b1, b2 ], (block, callback) => {
      chain.storeBlock(block, callback);
    }, (err) => {
      if (err)
        return done(err);

      b2.verify(chain, (err, result) => {
        assert(/Negative fee/.test(err.message));
        assert.deepEqual(result, false);

        done();
      });
    });
  });

  it('should fail to verify tx with non-existent input', (done) => {
    const block = new Block(hackchain.constants.genesis);

    const coinbase = new TX();
    coinbase.input(hackchain.constants.empty, 0, new TX.Script());
    coinbase.output(new BN(hackchain.constants.coinbase), new TX.Script());
    block.addCoinbase(coinbase);

    const fake = new TX();
    fake.output(new BN(1), new TX.Script());

    const tx = new TX();
    tx.input(fake.hash(), 0, new TX.Script());
    tx.output(new BN(1), new TX.Script());
    block.addTX(tx);

    async.parallel([
      (callback) => {
        chain.storeBlock(block, callback);
      }
    ], (err) => {
      if (err)
        return done(err);

      block.verify(chain, (err, result) => {
        assert(/Key not found in database/.test(err.message));
        assert.deepEqual(result, false);

        done();
      });
    });
  });
});
