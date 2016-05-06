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

describe('Block', () => {
  it('should render empty Block', () => {
    const block = new Block(hackchain.constants.empty);

    const buf = new WBuf();
    block.render(buf);

    const res = Buffer.concat(buf.render());
    assert.equal(res.toString('hex'), '00000001000000000000000000000000' +
                                      '00000000000000000000000000000000' +
                                      '0000000000000000');
  });

  it('should parse empty Block', () => {
    const buf = new OBuf();

    buf.push(Buffer.from('00000001000000000000000000000000' +
                         '00000000000000000000000000000000' +
                         '0000000000000000', 'hex'));

    const block = Block.parse(buf);

    assert.equal(block.version, 1);
    assert.equal(block.parent.toString('hex'),
                 hackchain.constants.empty.toString('hex'));
    assert.equal(block.txs.length, 0);
  });

  it('should hash empty Block', () => {
    const block = new Block(hackchain.constants.empty);

    assert.equal(block.hash().toString('hex'),
                 '8720f83d9a4eeaa0e8aad6214f3f5c74' +
                     '942ac16831b3caa72b1d4121221ae185');
  });

  it('should render non-empty Block', () => {
    const hash = crypto.createHash('sha256').update('ohai').digest();
    const block = new Block(hash);

    block.txs.push(new TX());

    const buf = new WBuf();
    block.render(buf);

    const res = Buffer.concat(buf.render());
    assert.equal(res.toString('hex'),
                 '00000001e84712238709398f6d349dc2' +
                     '250b0efca4b72d8c2bfb7b74339d30ba' +
                     '94056b14000000010000000100000000' +
                     '00000000');
  });

  it('should parse non-empty Block', () => {
    const buf = new OBuf();

    buf.push(Buffer.from('00000001e84712238709398f6d349dc2' +
                         '250b0efca4b72d8c2bfb7b74339d30ba' +
                         '94056b14000000010000000100000001' +
                         '00000001000000000000000000000000' +
                         '00000000000000000000000000000000' +
                         '00000000000000000000000000000000' +
                         '9502f90000000000', 'hex'));

    const block = Block.parse(buf);

    const hash = crypto.createHash('sha256').update('ohai').digest();
    assert.equal(block.version, 1);
    assert.equal(block.parent.toString('hex'), hash.toString('hex'));
    assert.equal(block.txs.length, 1);
    assert.equal(block.txs[0].inputs.length, 1);
    assert.equal(block.txs[0].outputs.length, 1);
  });

  it('should fail to parse Block without header', () => {
    const buf = new OBuf();

    buf.push(Buffer.from('00000001000000000000000000000000', 'hex'));

    assert.throws(() => {
      Block.parse(buf);
    }, /Block: not enough/);
  });

  it('should fail to parse Block with truncated TX', () => {
    const buf = new OBuf();

    buf.push(Buffer.from('00000001e84712238709398f6d349dc2' +
                         '250b0efca4b72d8c2bfb7b74339d30ba' +
                         '94056b14000000010000000100000000', 'hex'));

    assert.throws(() => {
      Block.parse(buf);
    }, /TX: not enough/i);
  });
});
