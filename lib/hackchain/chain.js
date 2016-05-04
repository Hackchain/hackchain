'use strict';

const level = require('level');
const Buffer = require('buffer').Buffer;
const OBuf = require('obuf');
const WBuf = require('wbuf');

const hackchain = require('../hackchain');
const Block = hackchain.Block;
const TX = hackchain.TX;

function Chain(path) {
  this.db = level(path, {
    valueEncoding: 'binary'
  });
}
module.exports = Chain;

Chain.prototype.close = function close(callback) {
  this.db.close(callback);
  this.db = null;
};

Chain.prototype._get = function _get(key, cons, callback) {
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

Chain.prototype._store = function _store(key, entity, callback) {
  const buf = new WBuf();
  entity.render(buf);

  const data = Buffer.concat(buf.render());

  this.db.put(key, data, callback);
};

Chain.prototype.storeBlock = function storeBlock(block, callback) {
  const hash = block.hash();
  this._store('block/' + hash.toString('hex'), block, callback);
};

Chain.prototype.storeTX = function storeTX(tx, callback) {
  const hash = tx.hash();
  this._store('tx/' + hash.toString('hex'), tx, callback);
};
