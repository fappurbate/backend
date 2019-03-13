const ivm = require('isolated-vm');

const { createRuntimeAPI, disposeRuntimeAPI } = require('./runtime');
const { createLoggerAPI, disposeLoggerAPI } = require('./logger');
const { createChaturbateAPI, disposeChaturbateAPI } = require('./chaturbate');
const { createGalleryAPI, disposeGalleryAPI } = require('./gallery');
const { createStorageAPI, disposeStorageAPI } = require('./storage');

module.exports.createAPI = function createAPI(data) {
  const { id, name, version, broadcaster } = data;

  const { api: runtime, meta: runtimeMeta } = createRuntimeAPI(data);
  const { api: logger, meta: loggerMeta } = createLoggerAPI(data);
  const { api: cb, meta: cbMeta } = createChaturbateAPI(data);
  const { api: gallery, meta: galleryMeta } = createGalleryAPI(data);
  const { api: storage, meta: storageMeta } = createStorageAPI(data);

  const api = { runtime, logger, cb, gallery, storage };

  const meta = {
    runtime: runtimeMeta,
    logger: loggerMeta,
    cb: cbMeta,
    gallery: galleryMeta,
    storage: storageMeta
  };

  return {
    api: new ivm.ExternalCopy(api).copyInto(),
    meta
  };
};

module.exports.disposeAPI = function disposeAPI(meta) {
  disposeGalleryAPI(meta.gallery);
  disposeChaturbateAPI(meta.cb);
  disposeLoggerAPI(meta.logger);
  disposeRuntimeAPI(meta.runtime);
  disposeStorageAPI(meta.storage);
};
