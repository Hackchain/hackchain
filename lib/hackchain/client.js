'use strict';

const assert = require('assert');
const url = require('url');
const http = require('http');
const https = require('https');
const Buffer = require('buffer').Buffer;
const BN = require('bn.js');

const OBuf = require('obuf');
const WBuf = require('wbuf');

const hackchain = require('../hackchain');
const TX = hackchain.TX;

function Client(uri) {
  const parsed = url.parse(uri);

  if (parsed.port === null)
    delete parsed.port;

  this.host = parsed.host;
  this.module = parsed.scheme === 'http:' ? http : https;
  this.agent = new this.module.Agent(parsed);
  this.prefix = '/v1';

  this.version = hackchain.version;
}
module.exports = Client;

Client.prototype.request = function request(method, path, callback) {
  let once = false;
  const done = (err, data) => {
    if (once)
      return;
    once = true;

    callback(err, data);
  };

  const req = this.module.request({
    agent: this.agent,

    method: method,
    path: this.prefix + path,
    headers: {
      'Host': this.host,
      'User-Agent': 'hackchain/client_v' + this.version,
      'Content-Type': 'application/json'
    }
  }, (res) => {
    let chunks = '';
    res.on('data', (chunk) => {
      chunks += chunk;
    });
    res.once('end', () => {
      let data;
      try {
        data = JSON.parse(chunks);
      } catch (e) {
        return done(e);
      }

      if (data.error)
        return done(new Error(data.error));

      if (res.statusCode < 200 || res.statusCode >= 400)
        return callback(new Error('Client: statusCode ' + res.statusCode));

      done(null, data);
    });
  });

  req.once('error', done);

  return req;
};

Client.prototype.get = function get(path, callback) {
  this.request('GET', path, callback).end();
};

Client.prototype.post = function post(path, body, callback) {
  this.request('POST', path, callback).end(JSON.stringify(body));
};

Client.prototype.parseEntity = function parseEntity(hex, cons, callback) {
  const raw = Buffer.from(hex, 'hex');
  const buf = new OBuf();
  buf.push(raw);

  let entity;
  try {
    entity = cons.parse(buf);
  } catch (e) {
    return callback(e);
  }

  return callback(null, entity);
};

Client.prototype.getBlock = function getBlock(hash, callback) {
  this.get('/block/' + hash, (err, data) => {
    if (err)
      return callback(err);

    this.parseEntity(data.block, hackchain.Block, callback);
  });
};

Client.prototype.getTX = function getTX(hash, callback) {
  this.get('/tx/' + hash, (err, data) => {
    if (err)
      return callback(err);

    this.parseEntity(data.tx, TX, callback);
  });
};

Client.prototype.spendTX = function spendTX(tx, callback) {
  const buf = new WBuf();
  tx.render(buf);
  const data = { tx: Buffer.concat(buf.render()).toString('hex') };

  this.post('/tx/' + tx.hash().toString('hex'), data, (err, data) => {
    if (err)
      return callback(err);

    callback(null, tx);
  });
};

Client.prototype.parseTX = function parseTX(data, callback) {
  assert.equal(data.version, TX.version,
               'Client: version must be ' + TX.version);
  assert(Array.isArray(data.inputs), 'Client: `tx.inputs` must be an Array');
  assert(Array.isArray(data.outputs), 'Client: `tx.inputs` must be an Array');

  const tx = new TX();

  for (let i = 0; i < data.inputs.length; i++) {
    const input = data.inputs[i];
    assert(input && typeof input === 'object',
           'Client: `tx.inputs[]` must contain Objects');
    assert.equal(typeof input.hash, 'string',
                 'Client: `tx.inputs[].hash` must be a hex string');
    assert.equal(typeof input.index, 'number',
                 'Client: `tx.inputs[].number` must be a number');
    assert(Array.isArray(input.script),
           'Client: `tx.inputs[].script` must be an Array');

    const hash = Buffer.from(input.hash, 'hex');
    const index = input.index;
    const script = TX.Script.compileTextArray(input.script);

    tx.input(hash, index, script);
  }

  for (let i = 0; i < data.outputs.length; i++) {
    const output = data.outputs[i];
    assert(output && typeof output === 'object',
           'Client: `tx.outputs[]` must contain Objects');
    assert.equal(typeof output.value, 'string',
                 'Client: `tx.output[].value` must be a decimal string');
    assert(Array.isArray(output.script),
           'Client: `tx.outputs[].script` must be an Array');

    const value = new BN(output.value, 10);
    const script = TX.Script.compileTextArray(output.script);

    tx.output(value, script);
  }

  callback(null, tx);
};

Client.prototype.getInfo = function getInfo(callback) {
  this.get('/', callback);
};

Client.prototype.getUnspent = function getUnspent(callback) {
  this.get('/unspent', callback);
};
