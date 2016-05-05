'use strict';

const assert = require('assert');
const Buffer = require('buffer').Buffer;
const BN = require('bn.js');
const WBuf = require('wbuf');
const OBuf = require('obuf');

const hackchain = require('../../');
const TX = hackchain.TX;
const Input = TX.Input;

describe('TX/Input', () => {
  it('should render input', () => {
    const s = new Input(Buffer.from('e3b0c44298fc1c149afbf4c8996fb924' +
                                    '27ae41e4649b934ca495991b7852b855', 'hex'),
                        0x123,
                        new TX.Script());

    const buf = new WBuf();
    s.render(buf);

    const res = Buffer.concat(buf.render());
    assert.equal(res.toString('hex'), 'e3b0c44298fc1c149afbf4c8996fb924' +
                                      '27ae41e4649b934ca495991b7852b855' +
                                      '0000012300000000');
  });

  it('should parse input', () => {
    const buf = new OBuf();

    [
      'e3b0c44298fc1c149afbf4c8996fb924',
      '27ae41e4649b934ca495991b7852b855',
      '0000012300000000'
    ].forEach((chunk) => {
      buf.push(Buffer.from(chunk, 'hex'));
    });

    const i = Input.parse(buf);

    assert.equal(i.hash.toString('hex'), 'e3b0c44298fc1c149afbf4c8996fb924' +
                                         '27ae41e4649b934ca495991b7852b855');
    assert.equal(i.index, 0x123);
    assert.equal(i.script.opcodes.length, 0);
  });

  it('should fail to parse invalid input', () => {
    const buf = new OBuf();

    [
      'e3b0c44298fc1c149afbf4c8996fb924',
      '27ae41e4649b934ca495991b7852b855'
    ].forEach((chunk) => {
      buf.push(Buffer.from(chunk, 'hex'));
    });

    assert.throws(() => {
      Input.parse(buf);
    }, /not enough data/);
  });
});
