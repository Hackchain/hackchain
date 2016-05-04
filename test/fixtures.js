'use strict';

const path = require('path');
const spawnSync = require('child_process').spawnSync;

exports.tmpPath = path.join(__dirname, 'tmp');
exports.dbPath = path.join(exports.tmpPath, 'db');

exports.removeDB = function removeDB() {
  spawnSync('rm', [ '-rf', exports.dbPath ]);
};
