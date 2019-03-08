const ivm = require('isolated-vm');

const { errorToObject } = require('./common/util');

module.exports.createStorageAPI = function createStorageAPI(data) {
  const { id, broadcaster, callAction } = data;

  const api = {
    set: new ivm.Reference((pairs, cbRef) =>
      void callAction('extensions.storageSet', {
        extensionId: id,
        broadcaster,
        pairs
      })
      .then(
        () => cbRef.applyIgnored(),
        error => cbRef.applyIgnored(undefined, [
          new ivm.ExternalCopy(errorToObject(error)).copyInto()
        ])
      )
    ),
    get: new ivm.Reference((keys, cbRef) => {
      void callAction('extensions.storageGet', {
        extensionId: id,
        broadcaster,
        keys
      })
      .then(
        result => cbRef.applyIgnored(undefined, [
          undefined,
          new ivm.ExternalCopy(result).copyInto()
        ]),
        error => cbRef.applyIgnored(undefined, [
          new ivm.ExternalCopy(errorToObject(error)).copyInto()
        ])
      )
    }
    ),
    remove: new ivm.Reference((keys, cbRef) =>
      void callAction('extensions.storageRemove', {
        extensionId: id,
        broadcaster,
        keys
      })
      .then(
        removed => cbRef.applyIgnored(undefined, [undefined, removed]),
        error => cbRef.applyIgnored(undefined, [
          new ivm.ExternalCopy(errorToObject(error)).copyInto()
        ])
      )
    ),
    getAll: new ivm.Reference(cbRef =>
      void callAction('extensions.storageGetAll', {
        extensionId: id,
        broadcaster
      })
      .then(
        result => cbRef.applyIgnored(undefined, [
          undefined,
          new ivm.ExternalCopy(result).copyInto()
        ]),
        error => cbRef.applyIgnored(undefined, [
          new ivm.ExternalCopy(errorToObject(error)).copyInto()
        ])
      )
    ),
    removeAll: new ivm.Reference(cbRef =>
      void callAction('extensions.storageRemoveAll', {
        extensionId: id,
        broadcaster
      })
      .then(
        removed => cbRef.applyIgnored(undefined, [undefined, removed]),
        error => cbRef.applyIgnored(undefined, [
          new ivm.ExternalCopy(errorToObject(error)).copyInto()
        ])
      )
    )
  };

  return { api };
};

module.exports.disposeStorageAPI = function disposeStorageAPI(meta) { };
