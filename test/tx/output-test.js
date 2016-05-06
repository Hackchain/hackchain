'use strict';

const assert = require('assert');
const Buffer = require('buffer').Buffer;
const BN = require('bn.js');
const WBuf = require('wbuf');
const OBuf = require('obuf');

const hackchain = require('../../');
const TX = hackchain.TX;
const Output = TX.Output;

describe('TX/Output', () => {
  it('should render output', () => {
    const s = new Output(new BN(0x13589), new TX.Script());

    const buf = new WBuf();
    s.render(buf);

    const res = Buffer.concat(buf.render());
    assert.equal(res.toString('hex'), '000000000001358900000000');
  });

  it('should parse output', () => {
    const buf = new OBuf();

    buf.push(Buffer.from('000000000001358900000000', 'hex'));

    const o = Output.parse(buf);

    assert.equal(o.value.toString(16), '13589');
    assert.equal(o.script.opcodes.length, 0);
  });

  it('should fail to render invalid output', () => {
    const s = new Output(new BN('baababbadeaddeadbeef', 16), new TX.Script());

    const buf = new WBuf();

    assert.throws(() => {
      s.render(buf);
    }, /value is too big/);
  });

  it('should fail to parse invalid output', () => {
    const buf = new OBuf();

    buf.push(Buffer.from('00', 'hex'));

    assert.throws(() => {
      Output.parse(buf);
    }, /not enough data/);
  });

  it('should fail to parse invalid output', () => {
    const buf = new OBuf();

    buf.push(Buffer.from('000000000000000000000000', 'hex'));

    assert.throws(() => {
      Output.parse(buf);
    }, /empty value/);
  });
});
