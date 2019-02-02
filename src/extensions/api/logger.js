const ivm = require('isolated-vm');

module.exports = function (data) {
  const { id, broadcaster, logger } = data;

  return {
    error: new ivm.Reference((...args) => logger.log('error', ...args)),
    warn: new ivm.Reference((...args) => logger.log('warn', ...args)),
    info: new ivm.Reference((...args) => logger.log('info', ...args)),
    verbose: new ivm.Reference((...args) => logger.log('verbose', ...args)),
    debug: new ivm.Reference((...args) => logger.log('debug', ...args)),
    silly: new ivm.Reference((...args) => logger.log('silly', ...args))
  };
};
