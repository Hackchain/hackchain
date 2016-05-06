'use strict';

const url = require('url');
const http = require('http');
const https = require('https');
const OBuf = require('obuf');

const hackchain = require('../hackchain');

function Client(uri) {
  const parsed = url.parse(uri);

  if (parsed.port === null)
    delete parsed.port;

  this.host = parsed.host;
  this.module = parsed.scheme === 'http:' ? http : https;
  this.agent = new this.module.Agent(parsed);
  this.prefix = '/v1';

  // TODO(indutny): use package.json
  this.version = '1.0.0';
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
    if (res.statusCode < 200 || res.statusCode >= 400)
      return callback(new Error('Client: statusCode ' + res.statusCode));

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

    this.parseEntity(data.tx, hackchain.TX, callback);
  });
};
