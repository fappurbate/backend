const ivm = require('isolated-vm');

const { createRuntimeAPI, disposeRuntimeAPI } = require('./runtime');
const { createLoggerAPI, disposeLoggerAPI } = require('./logger');
const { createChaturbateAPI, disposeChaturbateAPI } = require('./chaturbate');

module.exports.createAPI = function createAPI(data) {
  const { id, name, version, broadcaster } = data;

  const { api: runtime, meta: runtimeMeta } = createRuntimeAPI(data);
  const { api: logger, meta: loggerMeta } = createLoggerAPI(data);
  const { api: cb, meta: cbMeta } = createChaturbateAPI(data);

  const api = { runtime, logger, cb };

  const meta = {
    runtime: runtimeMeta,
    logger: loggerMeta,
    cb: cbMeta
  };

  return {
    api: new ivm.ExternalCopy(api).copyInto(),
    meta
  };
};

module.exports.disposeAPI = function disposeAPI(meta) {
  disposeRuntimeAPI(meta.runtime);
  disposeLoggerAPI(meta.logger);
  disposeChaturbateAPI(meta.cb);
};
