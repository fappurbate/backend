const ivm = require('isolated-vm');

const createLoggerAPI = require('./logger');

module.exports.createAPI = function createAPI(data) {
  const { id, name, version broadcaster } = data;

  const api = {
    runtime: { id, name, version, broadcaster },
    logger: createLoggerAPI(data)
  };

  return new ivm.ExternalCopy(api);
};
