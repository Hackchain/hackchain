'use strict';

const async = require('async');
const assert = require('assert');
const level = require('level');
const Buffer = require('buffer').Buffer;
const BN = require('bn.js');
const OBuf = require('obuf');
const WBuf = require('wbuf');
const LRU = require('lru');

const hackchain = require('../hackchain');
const Block = hackchain.Block;
const TX = hackchain.TX;

const LRU_SIZE = 1024;

function Chain(path, options) {
  this.db = level(path, {
    valueEncoding: 'binary'
  });

  assert.equal(typeof options.workers, 'number',
               'Chain: `config.chain.workers` is required');
  this.interpreter = new hackchain.Interpreter.Pool(options.workers);

  this.lastBlock = hackchain.constants.genesis;
  this.lock = false;

  this.lru = new LRU(LRU_SIZE);
}
module.exports = Chain;

Chain.prototype.init = function init(callback) {
  if (this.db === null)
    return callback(new Error('Chain: DB is closed'));

  this.db.get(this._lastBlockKey(), (err, value) => {
    // Ignore errors, we may be initializing the db for the first time
    if (value)
      this.lastBlock = value;
    callback(null);
  });
};

Chain.prototype.close = function close(callback) {
  this.db.close(callback);
  this.db = null;
};

Chain.prototype._get = function _get(key, cons, callback) {
  if (this.db === null)
    return callback(new Error('Chain: DB is closed'));

  const cached = this.lru.get(key);
  if (cached)
    return callback(null, cached);

  const done = (err, entity) => {
    if (err)
      return callback(err);

    this.lru.set(key, entity);

    callback(null, entity);
  };

  this.db.get(key, (err, value) => {
    if (err)
      return done(err);

    const buf = new OBuf();
    buf.push(value);

    let entity;
    try {
      entity = cons.parse(buf);
    } catch (e) {
      return done(e);
    }

    done(null, entity);
  });
};

Chain.prototype._lastBlockKey = function _lastBlockKey(hash) {
  return 'block/last';
};

Chain.prototype._blockKey = function _blockKey(hash) {
  return `block/${hash}`;
};

Chain.prototype._txKey = function _txKey(hash) {
  return `tx/${hash}`;
};

Chain.prototype._txBlockKey = function _txBlockKey(hash) {
  return `tx/${hash}/block`;
};

Chain.prototype._txSpentByKey = function _txSpentByKey(hash, index) {
  return `tx/${hash}/${index}/spentby`;
};

Chain.prototype._txUnspentPrefix = function _txUnspentPrefix() {
  return 'tx/unspent/';
};

Chain.prototype._txUnspentKey = function _txUnspentKey(hash, index, value) {
  return `tx/unspent/${value}/${hash}/${index}`;
};

Chain.prototype.getBlock = function getBlock(hash, callback) {
  this._get(this._blockKey(hash.toString('hex')), Block, callback);
};

Chain.prototype.getTX = function getTX(hash, callback) {
  this._get(this._txKey(hash.toString('hex')), TX, callback);
};

Chain.prototype.getTXBlock = function getTXBlock(hash, callback) {
  if (this.db === null)
    return callback(new Error('Chain: DB is closed'));
  this.db.get(this._txBlockKey(hash.toString('hex')), callback);
};

Chain.prototype.getTXSpentBy = function getTXSpentBy(hash, index, callback) {
  if (this.db === null)
    return callback(new Error('Chain: DB is closed'));
  this.db.get(this._txSpentByKey(hash.toString('hex'), index), callback);
};

Chain.prototype.getUnspentTXs = function getUnspentTXs(count, callback) {
  if (this.db === null)
    return callback(new Error('Chain: DB is closed'));

  const prefix = this._txUnspentPrefix();

  const stream = this.db.createReadStream({
    gt: prefix,
    lt: prefix + 'z',
    reverse: true,
    limit: isFinite(count) ? count : -1
  });

  const txs = [];
  stream.on('data', (entry) => {
    const data = entry.key.slice(prefix.length).split('/');
    const value = new BN(data[0], 16);

    txs.push({
      hash: Buffer.from(data[1], 'hex'),
      index: parseInt(data[2], 10),
      value: value
    });
  });
  stream.once('error', callback);
  stream.once('end', () => {
    callback(null, txs);
  });
};

Chain.prototype._store = function _store(key, entity, callback) {
  if (this.db === null)
    return callback(new Error('Chain: DB is closed'));

  const buf = new WBuf();
  entity.render(buf);

  const data = Buffer.concat(buf.render());

  this.db.put(key, data, callback);
};

Chain.prototype.storeSpendingTX = function storeSpendingTX(tx, callback) {
  const hash = tx.hash();

  async.forEach(tx.inputs, (input, callback) => {
    async.parallel([
      (callback) => {
        const key = this._txSpentByKey(input.hash.toString('hex'), input.index);
        this.db.put(key, hash, callback);
      },
      (callback) => {
        if (tx.coinbase)
          return callback(null);

        this.removeUnspentTX(input.hash, input.index, callback);
      }
    ], callback);
  }, callback);
};

Chain.prototype.removeUnspentTX = function removeUnspentTX(hash, index,
                                                           callback) {
  this.getTX(hash, (err, tx) => {
    if (err)
      return callback(null);

    if (tx.outputs.length <= index)
      return callback(null);

    const key = this._txUnspentKey(
        hash.toString('hex'), index,
        tx.outputs[index].getBufferValue().toString('hex'));
    this.db.del(key, callback);
  });
};

Chain.prototype.storeBlock = function storeBlock(block, callback) {
  const hash = block.hash();

  assert(!this.lock, 'Chain: locked');
  this.lock = true;

  assert(block.parent.equals(this.lastBlock), 'Chain: forking is not allowed');

  const storeTX = (tx, callback) => {
    async.parallel([
      (callback) => {
        this.db.put(this._txBlockKey(tx.hash().toString('hex')), hash,
                    callback);
      },
      (callback) => {
        this.storeSpendingTX(tx, callback);
      }
    ], (err) => {
      if (err)
        return callback(err);
      this.storeTX(tx, callback);
    });
  };

  const onTXStore = (err) => {
    if (!err) {
      this.lastBlock = block.hash();

      // Store last block
      this.db.put(this._lastBlockKey(), this.lastBlock, (err) => {
        this.lock = false;
        if (err)
          return callback(err);
        else
          return callback(null);
      });
      return;
    }

    // Attempt to remove all TXs on error
    async.forEach(block.txs, (tx, callback) => {
      this.removeTX(tx, callback);
    }, () => {
      this.lock = false;
      callback(err);
    });
  };

  this._store(this._blockKey(hash.toString('hex')), block, (err) => {
    if (err)
      return callback(err);

    async.forEach(block.txs, storeTX, onTXStore);
  });
};

Chain.prototype.storeTX = function storeTX(tx, callback) {
  const hash = tx.hash().toString('hex');

  async.parallel([
    (callback) => {
      this._store(this._txKey(hash), tx, callback);
    },
    (callback) => {
      async.times(tx.outputs.length, (index, callback) => {
        // Do not store empty outputs
        if (tx.outputs[index].value.cmpn(0) === 0)
          return callback(null);

        const key = this._txUnspentKey(
            hash, index, tx.outputs[index].getBufferValue().toString('hex'));
        this.db.put(key, Buffer.alloc(0), callback);
      }, callback);
    }
  ], callback);
};

Chain.prototype.removeTX = function removeTX(tx, callback) {
  const hash = tx.hash().toString('hex');

  async.parallel([
    (callback) => {
      this.db.del(this._txKey(hash), callback);
    },
    (callback) => {
      this.db.del(this._txBlockKey(hash), callback);
    },
    (callback) => {
      async.times(tx.outputs.length, (index, callback) => {
        const key = this._txUnspentKey(
            hash, index, tx.outputs[index].getBufferValue().toString('hex'));
        this.db.del(key, callback);
      }, callback);
    },
    (callback) => {
      async.times(tx.outputs.length, (index, callback) => {
        this.db.del(this._txSpentByKey(hash, index), callback);
      }, callback);
    }
  ], callback);
};
