const ivm = _ivm;
delete _ivm;

const api = _api;
delete _api;

global.kck = {
  runtime: {
    id: api.runtime.id,
    name: api.runtime.name,
    version: api.runtime.version,
    broadcaster: api.runtime.broadcaster
  },
  logger: {
    error: (...args) => api.logger.error.applyIgnored(undefined, args.map(arg => new ivm.ExternalCopy(arg).copyInto())),
    info: (...args) => api.logger.info.applyIgnored(undefined, args.map(arg => new ivm.ExternalCopy(arg).copyInto())),
    warn: (...args) => api.logger.warn.applyIgnored(undefined, args.map(arg => new ivm.ExternalCopy(arg).copyInto())),
    verbose: (...args) => api.logger.verbose.applyIgnored(undefined, args.map(arg => new ivm.ExternalCopy(arg).copyInto())),
    debug: (...args) => api.logger.debug.applyIgnored(undefined, args.map(arg => new ivm.ExternalCopy(arg).copyInto())),
    silly: (...args) => api.logger.silly.applyIgnored(undefined, args.map(arg => new ivm.ExternalCopy(arg).copyInto()))
  }
};
