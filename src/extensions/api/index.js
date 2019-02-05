const ivm = require('isolated-vm');

const { createRuntimeAPI, disposeRuntimeAPI } = require('./runtime');
const { createLoggerAPI, disposeLoggerAPI } = require('./logger');

module.exports.createAPI = function createAPI(data) {
  const { id, name, version, broadcaster } = data;

  const { api: runtime, meta: runtimeMeta } = createRuntimeAPI(data);
  const { api: logger, meta: loggerMeta } = createLoggerAPI(data);

  const api = { runtime, logger };

  const meta = {
    runtime: runtimeMeta,
    logger: loggerMeta
  }

  return {
    api: new ivm.ExternalCopy(api).copyInto(),
    meta
  };
};

module.exports.disposeAPI = function disposeAPI(meta) {
  disposeRuntimeAPI(meta.runtime);
  disposeLoggerAPI(meta.logger);
}
