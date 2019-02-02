const ivm = require('isolated-vm');

const createLoggerAPI = require('./logger');

module.exports.createAPI = function createAPI(data) {
  const { id, broadcaster } = data;

  const api = {
    runtime: { id, broadcaster },
    logger: createLoggerAPI(data)
  };

  return new ivm.ExternalCopy(api);
};
