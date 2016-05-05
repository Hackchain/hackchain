'use strict';

const assert = require('assert');
const Buffer = require('buffer').Buffer;
const WBuf = require('wbuf');
const OBuf = require('obuf');

const hackchain = require('../../');
const Script = hackchain.TX.Script;

describe('TX/Script', () => {
  it('should render empty script', () => {
    const s = new Script();

    const buf = new WBuf();
    s.render(buf);

    // Empty script
    const res = Buffer.concat(buf.render());
    assert.equal(res.toString('hex'), '00000000');
  });

  it('should parse empty script', () => {
    const buf = new OBuf();

    buf.push(Buffer.from('00000000', 'hex'));
    const s = Script.parse(buf);

    assert.equal(s.opcodes.length, 0);
  });

  it('should fail to parse invalid script', () => {
    const buf = new OBuf();

    buf.push(Buffer.from('000000', 'hex'));

    assert.throws(() => {
      Script.parse(buf);
    }, /not enough data/);
  });

  it('should render non-empty script', () => {
    const s = new Script(Buffer.from('abcd', 'hex'));

    const buf = new WBuf();
    s.render(buf);

    // Empty script
    const res = Buffer.concat(buf.render());
    assert.equal(res.toString('hex'), '00000002abcd');
  });

  it('should parse non-empty script', () => {
    const buf = new OBuf();

    buf.push(Buffer.from('00000002abcd', 'hex'));
    const s = Script.parse(buf);

    assert.equal(s.opcodes.length, 2);
    assert.equal(s.opcodes.toString('hex'), 'abcd');
  });

  it('should fail to parse too big script', () => {
    const buf = new OBuf();

    const hdr = Buffer.alloc(4);
    hdr.writeUInt32BE(Script.maxLen + 1);

    buf.push(hdr);

    assert.throws(() => {
      Script.parse(buf);
    }, /too long/);
  });
});
