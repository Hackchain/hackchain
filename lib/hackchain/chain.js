'use strict';

const async = require('async');
const assert = require('assert');
const level = require('level');
const Buffer = require('buffer').Buffer;
const OBuf = require('obuf');
const WBuf = require('wbuf');

const hackchain = require('../hackchain');
const Block = hackchain.Block;
const TX = hackchain.TX;

function Chain(path, options) {
  this.db = level(path, {
    valueEncoding: 'binary'
  });

  assert.equal(typeof options.workers, 'number',
               'Chain: `config.chain.workers` is required');
  this.interpreter = new hackchain.Interpreter.Pool(options.workers);

  this.lastBlock = hackchain.constants.genesis;
  this.lock = false;
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

  this.db.get(key, (err, value) => {
    if (err)
      return callback(err);

    const buf = new OBuf();
    buf.push(value);

    let entity;
    try {
      entity = cons.parse(buf);
    } catch (e) {
      return callback(e);
    }

    callback(null, entity);
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

Chain.prototype._txUnspentKey = function _txUnspentKey(hash, index) {
  return `tx/unspent/${hash}/${index}`;
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

  const stream = this.db.createKeyStream({
    gt: prefix,
    lt: prefix + 'z',
    limit: isFinite(count) ? count : -1
  });

  const txs = [];
  stream.on('data', (key) => {
    const data = key.slice(prefix.length).split('/');

    txs.push({
      hash: Buffer.from(data[0], 'hex'),
      index: parseInt(data[1], 10)
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
        const key = this._txUnspentKey(input.hash.toString('hex'), input.index);
        this.db.del(key, callback);
      }
    ], callback);
  }, callback);
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
      callback(null);
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
        this.db.put(this._txUnspentKey(hash, index), Buffer.alloc(1), callback);
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
        this.db.del(this._txUnspentKey(hash, index), callback);
      }, callback);
    },
    (callback) => {
      async.times(tx.outputs.length, (index, callback) => {
        this.db.del(this._txSpentByKey(hash, index), callback);
      }, callback);
    }
  ], callback);
};
