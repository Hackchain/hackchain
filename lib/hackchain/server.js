'use strict';

const https = require('https');
const util = require('util');
const Buffer = require('buffer').Buffer;
const WBuf = require('wbuf');
const OBuf = require('obuf');

const hackchain = require('../hackchain');

const MAX_BODY_SIZE = 256 * 1024;

function Server(options) {
  https.Server.call(this, options.ssl, this._requestHandler);

  this.chain = new hackchain.Chain(options.db);
  this.pool = new hackchain.Pool(this.chain, options.pool);

  // TODO(indutny): read from package.json
  this.version = '1.0.0';
}
util.inherits(Server, https.Server);
module.exports = Server;

Server.prototype.init = function init(callback) {
  this.chain.init((err) => {
    if (err)
      return callback(err);

    this.pool.start();
    callback(null);
  });
};

function RouteHandler(server, req, res) {
  this.server = server;
  this.req = req;
  this.res = res;
}

RouteHandler.prototype.run = function run() {
  const req = this.req;
  if (req.method === 'GET') {
    if (req.url === '/')
      return this.getInfo();

    let match = req.url.match(/^\/(tx|block)\/((?:[a-f0-9]{2})+)$/);
    if (match !== null) {
      if (match[1] === 'block')
        return this.getBlock(match[2]);
      else if (match[1] === 'tx')
        return this.getTX(match[2]);
    }
  } else if (req.method === 'POST') {
    let match = req.url.match(/^\/tx\/((?:[a-f0-9]{2})+)$/);
    if (match !== null)
      return this.postTX(match[1]);
  }

  this.respond(404, { error: 'Not found' });
};

RouteHandler.prototype.respond = function respond(statusCode, body) {
  const res = this.res;

  res.writeHead(statusCode, {
    server: 'hackchain/' + this.version,
    'content-type': 'application/json'
  });
  res.end(JSON.stringify(body));
};

RouteHandler.prototype.withBody = function withBody(callback) {
  const req = this.req;

  if (req.headers['content-type'] !== 'application/json')
    return callback(new Error('Invalid Content-Type value'));

  let chunks = '';
  req.on('data', (chunk) => {
    chunks += chunk;
    if (chunks.length > MAX_BODY_SIZE) {
      req.pause();
      return callback(new Error('Body overflow'));
    }
  });

  req.once('end', () => {
    let data;

    try {
      data = JSON.parse(chunks);
    } catch (e) {
      return callback(e);
    }

    callback(null, data);
  });
};

RouteHandler.prototype.getInfo = function getInfo() {
  this.respond(200, {
    lastBlock: this.server.chain.lastBlock.toString('hex')
  });
};

RouteHandler.prototype.getBlock = function getBlock(hash) {
  this.server.chain.getBlock(Buffer.from(hash, 'hex'), (err, block) => {
    if (err)
      return this.respond(404, { error: 'Block not found' });

    const buf = new WBuf();
    block.render(buf);
    this.respond(200, {
      block: Buffer.concat(buf.render()).toString('hex')
    });
  });
};

RouteHandler.prototype.getTX = function getTX(hash) {
  this.server.chain.getTX(Buffer.from(hash, 'hex'), (err, tx) => {
    if (err)
      return this.respond(404, { error: 'TX not found' });

    const buf = new WBuf();
    tx.render(buf);
    this.respond(200, {
      tx: Buffer.concat(buf.render()).toString('hex')
    });
  });
};

RouteHandler.prototype.postTX = function postTX(hash) {
  this.withBody((err, body) => {
    if (err)
      return this.respond(400, { error: err.message });

    if (!body.tx || typeof body.tx !== 'string' || /[^a-f0-9]/.test(body.tx))
      return this.respond(400, { error: '`body.tx` must be a hex string' });

    let tx;
    try {
      tx = Buffer.from(body.tx, 'hex');
    } catch (e) {
      return this.respond(400, { error: e.message });
    }

    const buf = new OBuf();
    buf.push(tx);

    try {
      tx = hackchain.TX.parse(buf);
    } catch (e) {
      return this.respond(400, { error: e.message });
    }

    this.server.pool.accept(tx, (err) => {
      if (err)
        return this.respond(400, { error: err.message });

      this.respond(200, { ok: true });
    });
  });
};

Server.prototype._requestHandler = function _requestHandler(req, res) {
  const handler = new RouteHandler(this, req, res);

  handler.run();
};
