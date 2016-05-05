'use strict';

const assert = require('assert');
const Buffer = require('buffer').Buffer;
const BN = require('bn.js');
const WBuf = require('wbuf');
const OBuf = require('obuf');

const hackchain = require('../../');
const TX = hackchain.TX;

describe('TX', () => {
  it('should render empty TX', () => {
    const tx = new TX();

    const buf = new WBuf();
    tx.render(buf);

    const res = Buffer.concat(buf.render());
    assert.equal(res.toString('hex'), '000000010000000000000000');
  });

  it('should parse empty TX', () => {
    const buf = new OBuf();

    buf.push(Buffer.from('000000010000000000000000', 'hex'));

    const tx = TX.parse(buf);

    assert.equal(tx.version, 1);
    assert.equal(tx.inputs.length, 0);
    assert.equal(tx.outputs.length, 0);
  });

  it('should hash empty TX', () => {
    const tx = new TX();

    assert.equal(tx.hash().toString('hex'), '9cbc73d18d70c94fe366e696035c4f2c' +
                                            'ffdbab7ea6d6c2c039ca185f9c9f2746');
  });

  it('should render non-empty TX', () => {
    const tx = new TX();

    tx.input(Buffer.from('e3b0c44298fc1c149afbf4c8996fb924' +
                         '27ae41e4649b934ca495991b7852b855', 'hex'),
             0x123,
             new TX.Script());
    tx.output(new BN(0x13589), new TX.Script());

    const buf = new WBuf();
    tx.render(buf);

    const res = Buffer.concat(buf.render());
    assert.equal(res.toString('hex'), '000000010000000100000001e3b0c442' +
                                      '98fc1c149afbf4c8996fb92427ae41e4' +
                                      '649b934ca495991b7852b85500000123' +
                                      '00000000000000000001358900000000');
  });

  it('should hash non-empty TX', () => {
    const tx = new TX();

    tx.input(Buffer.from('e3b0c44298fc1c149afbf4c8996fb924' +
                         '27ae41e4649b934ca495991b7852b855', 'hex'),
             0x123,
             new TX.Script());
    tx.output(new BN(0x13589), new TX.Script());

    assert.equal(tx.hash().toString('hex'), '233a9cdce2cbf480e0b3bfecb8340ff9' +
                                            'd0eff61cf997ee115b79f7187a357d5c');
  });

  it('should parse non-empty TX', () => {
    const buf = new OBuf();

    [
      '000000010000000100000001e3b0c442',
      '98fc1c149afbf4c8996fb92427ae41e4',
      '649b934ca495991b7852b85500000123',
      '00000000000000000001358900000000'
    ].forEach((chunk) => {
      buf.push(Buffer.from(chunk, 'hex'));
    });

    const tx = TX.parse(buf);

    assert.equal(tx.version, 1);
    assert.equal(tx.inputs.length, 1);
    assert.equal(tx.outputs.length, 1);

    assert.equal(tx.inputs[0].hash.toString('hex'),
                 'e3b0c44298fc1c149afbf4c8996fb924' +
                        '27ae41e4649b934ca495991b7852b855');
    assert.equal(tx.inputs[0].index, 0x123);
    assert.equal(tx.inputs[0].script.opcodes.length, 0);

    assert.equal(tx.outputs[0].value.toString(16), '13589');
    assert.equal(tx.outputs[0].script.opcodes.length, 0);
  });

  it('should fail to parse TX without header', () => {
    const buf = new OBuf();

    buf.push(Buffer.from('000000', 'hex'));

    assert.throws(() => {
      TX.parse(buf);
    }, /TX: not enough space/i);
  });

  it('should fail to parse TX without enough space for input', () => {
    const buf = new OBuf();

    buf.push(Buffer.from('000000010000000100000001e3b0c442', 'hex'));

    assert.throws(() => {
      TX.parse(buf);
    }, /Input: not enough data/i);
  });
});
