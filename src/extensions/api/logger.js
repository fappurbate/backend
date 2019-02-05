const ivm = require('isolated-vm');

module.exports.createLoggerAPI = function createLoggerAPI(data) {
  const { logger } = data;

  return {
    api: {
      error: new ivm.Reference((...args) => logger.log('error', ...args)),
      warn: new ivm.Reference((...args) => logger.log('warn', ...args)),
      info: new ivm.Reference((...args) => logger.log('info', ...args)),
      verbose: new ivm.Reference((...args) => logger.log('verbose', ...args)),
      debug: new ivm.Reference((...args) => logger.log('debug', ...args)),
      silly: new ivm.Reference((...args) => logger.log('silly', ...args))
    },
    meta: null
  };
};

module.exports.disposeLoggerAPI = function disposeLoggerAPI(meta) { };
