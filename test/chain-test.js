'use strict';

const assert = require('assert');
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

describe('Block', () => {
  let chain;

  beforeEach(() => {
    fixtures.removeDB();

    chain = new Chain(fixtures.dbPath);
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

    chain.storeBlock(b, (err) => {
      assert.deepEqual(err, null);

      chain.getBlock(b.hash().toString('hex'), (err, block) => {
        assert.deepEqual(err, null);

        assert.deepEqual(block, b);
        done();
      });
    });
  });

  it('should store/load tx', (done) => {
    const tx = new TX();

    chain.storeTX(tx, (err) => {
      assert.deepEqual(err, null);

      chain.getTX(tx.hash().toString('hex'), (err, tx2) => {
        assert.deepEqual(err, null);

        assert.deepEqual(tx2, tx);
        done();
      });
    });
  });
});
