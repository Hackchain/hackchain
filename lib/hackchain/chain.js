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

  this.db.get('block/last', (err, value) => {
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

Chain.prototype.getBlock = function getBlock(hash, callback) {
  this._get('block/' + hash.toString('hex'), Block, callback);
};

Chain.prototype.getTX = function getTX(hash, callback) {
  this._get('tx/' + hash.toString('hex'), TX, callback);
};

Chain.prototype.getTXBlock = function getTXBlock(hash, callback) {
  if (this.db === null)
    return callback(new Error('Chain: DB is closed'));
  this.db.get('tx/' + hash.toString('hex') + '/block', callback);
};

Chain.prototype.getTXSpentBy = function getTXSpentBy(hash, index, callback) {
  if (this.db === null)
    return callback(new Error('Chain: DB is closed'));
  this.db.get('tx/' + hash.toString('hex') + '/' + index + '/spentby',
              callback);
};

Chain.prototype._store = function _store(key, entity, callback) {
  if (this.db === null)
    return callback(new Error('Chain: DB is closed'));

  const buf = new WBuf();
  entity.render(buf);

  const data = Buffer.concat(buf.render());

  this.db.put(key, data, callback);
};

Chain.prototype.storeBlock = function storeBlock(block, callback) {
  const hash = block.hash();

  assert(!this.lock, 'Chain: locked');
  this.lock = true;

  assert(block.parent.equals(this.lastBlock), 'Chain: forking is not allowed');

  const storeTXSpentBy = (tx, callback) => {
    const hash = tx.hash();

    async.forEach(tx.inputs, (input, callback) => {
      const key = 'tx/' + input.hash.toString('hex') + '/' + input.index +
                  '/spentby';
      this.db.put(key, hash, callback);
    }, callback);
  };

  const storeTX = (tx, callback) => {
    async.parallel([
      (callback) => {
        this.db.put('tx/' + tx.hash().toString('hex') + '/block', hash,
                    callback);
      },
      (callback) => {
        storeTXSpentBy(tx, callback);
      }
    ], (err) => {
      if (err)
        return callback(err);
      this.storeTX(tx, callback);
    });
  };

  const removeTX = (tx, callback) => {
    this.removeTX(tx, callback);
  };

  const onTXStore = (err) => {
    if (!err) {
      this.lastBlock = block.hash();

      // Store last block
      this.db.put('block/last', this.lastBlock, (err) => {
        this.lock = false;
        if (err)
          return callback(err);
        else
          return callback(null);
      });
      return;
    }

    // Attempt to remove all TXs on error
    async.forEach(block.txs, removeTX, () => {
      this.lock = false;
      callback(null);
    });
  };

  this._store('block/' + hash.toString('hex'), block, (err) => {
    if (err)
      return callback(err);

    async.forEach(block.txs, storeTX, onTXStore);
  });
};

Chain.prototype.storeTX = function storeTX(tx, callback) {
  const hash = tx.hash();
  this._store('tx/' + hash.toString('hex'), tx, callback);
};

Chain.prototype.removeTX = function removeTX(tx, callback) {
  const hash = tx.hash().toString('hex');

  async.parallel([
    (callback) => {
      this.db.del('tx/' + hash, callback);
    },
    (callback) => {
      this.db.del('tx/' + hash + '/block', callback);
    }
  ], callback);
};
