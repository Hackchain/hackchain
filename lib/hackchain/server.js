'use strict';

const hackchain = require('../hackchain');

function Server(options) {
  this.chain = new hackchain.Chain(options.db);
}
module.exports = Server;
