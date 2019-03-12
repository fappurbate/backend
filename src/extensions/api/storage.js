const ivm = require('isolated-vm');
const EventEmitter = require('events');
const msgpack = require('msgpack-lite');

const { errorToObject } = require('./common/util');

module.exports.createStorageAPI = function createStorageAPI(data) {
  const { id, broadcaster, logError, callAction, events } = data;

  const eventHandlers = new EventEmitter;

  const meta = { events };

  events.on('extensions-storage-change', meta.changeListener = payload => {
    if (payload.extensionId !== id || payload.broadcaster !== broadcaster) {
      return;
    }

    const { key, oldValue, newValue } = payload;
    eventHandlers.emit('change', key, {
      oldValue: oldValue,
      newValue: newValue
    });
  });

  const api = {
    set: new ivm.Reference((pairs, cbRef) =>
      void callAction('extensions.storageSet', {
        extensionId: id,
        broadcaster,
        pairs
      })
      .then(
        () => cbRef.apply().catch(logError),
        error => cbRef.apply(undefined, [
          new ivm.ExternalCopy(errorToObject(error)).copyInto()
        ]).catch(logError)
      )
    ),
    get: new ivm.Reference((keys, cbRef) =>
      void callAction('extensions.storageGet', {
        extensionId: id,
        broadcaster,
        keys
      })
      .then(
        result => cbRef.apply(undefined, [
          undefined,
          new ivm.ExternalCopy(result).copyInto()
        ]).catch(logError),
        error => cbRef.apply(undefined, [
          new ivm.ExternalCopy(errorToObject(error)).copyInto()
        ]).catch(logError)
      )
    ),
    remove: new ivm.Reference((keys, cbRef) =>
      void callAction('extensions.storageRemove', {
        extensionId: id,
        broadcaster,
        keys
      })
      .then(
        removed => cbRef.apply(undefined, [undefined, removed]).catch(logError),
        error => cbRef.apply(undefined, [
          new ivm.ExternalCopy(errorToObject(error)).copyInto()
        ]).catch(logError)
      )
    ),
    getAll: new ivm.Reference(cbRef =>
      void callAction('extensions.storageGetAll', {
        extensionId: id,
        broadcaster
      })
      .then(
        result => cbRef.apply(undefined, [
          undefined,
          new ivm.ExternalCopy(result).copyInto()
        ]).catch(logError),
        error => cbRef.apply(undefined, [
          new ivm.ExternalCopy(errorToObject(error)).copyInto()
        ]).catch(logError)
      )
    ),
    removeAll: new ivm.Reference(cbRef =>
      void callAction('extensions.storageRemoveAll', {
        extensionId: id,
        broadcaster
      })
      .then(
        removed => cbRef.apply(undefined, [undefined, removed]).catch(logError),
        error => cbRef.apply(undefined, [
          new ivm.ExternalCopy(errorToObject(error)).copyInto()
        ]).catch(logError)
      )
    ),
    onChanged: {
      addListener: new ivm.Reference(cbRef => {
        eventHandlers.on('change', (key, change) => cbRef.apply(
          undefined,
          [
            key,
            new ivm.ExternalCopy(change).copyInto()
          ]
        ).catch(logError));
      })
    }
  };

  return { api, meta };
};

module.exports.disposeStorageAPI = function disposeStorageAPI(meta) {
  meta.events.off('extensions-storage-change', meta.changeListener);
};
