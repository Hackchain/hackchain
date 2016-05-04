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

    buf.push(new Buffer('00000000', 'hex'));
    const s = Script.parse(buf);

    assert.equal(s.opcodes.length, 0);
  });

  it('should fail to parse invalid script', () => {
    const buf = new OBuf();

    buf.push(new Buffer('000000', 'hex'));

    assert.throws(() => {
      Script.parse(buf);
    }, /not enough data/);
  });
});
