'use strict';

const crypto = require('crypto');
const WBuf = require('wbuf');

function Entity() {
  this.readonly = false;
  this._raw = null;
  this._hash = null;
}
module.exports = Entity;

Entity.prototype._render = function _render() {
  throw new Error('Implement me');
};

Entity.prototype.render = function render(buf) {
  if (this._raw !== null) {
    for (let i = 0; i < this._raw.length; i++)
      buf.copyFrom(this._raw[i]);
    return buf;
  }

  this.readonly = true;

  const exclusive = buf.size === 0;

  this._render(buf);

  if (exclusive)
    this._raw = buf.render();

  return buf;
};

Entity.prototype.hash = function hash() {
  if (this._hash !== null)
    return this._hash;

  if (this._raw === null) {
    const buf = new WBuf();

    this.render(buf);
  }

  const hash = crypto.createHash('sha256');
  for (let i = 0; i < this._raw.length; i++)
    hash.update(this._raw[i]);
  this._hash = hash.digest();

  return this._hash;
};
