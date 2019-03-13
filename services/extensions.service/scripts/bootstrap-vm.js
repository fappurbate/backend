const ivm = _ivm;
delete _ivm;

const api = _api;
delete _api;

class FappurbateError extends Error {
  constructor(message, type, data) {
    super(message);
    Error.captureStackTrace(this, FappurbateError);

    this.name = 'FappurbateError';
    this.type = type;
    this.data = data;
  }
}

function objectToError(object) {
  const { message, type, data } = object;
  return new FappurbateError(message, type, data);
}

global.fb = {
  Error: FappurbateError,
  runtime: {
    id: api.runtime.id,
    name: api.runtime.name,
    version: api.runtime.version,
    broadcaster: api.runtime.broadcaster,
    onStart: {
      addListener: callback => {
        api.runtime.onStart.addListener.applyIgnored(undefined, [new ivm.Reference(callback)]);
        return global.fb.runtime.onStart;
      }
    },
    onStop: {
      addHandler: handler => {
        api.runtime.onStop.addHandler.applyIgnored(undefined, [new ivm.Reference(callback => {
          const result = handler();

          if (typeof result === 'object' && typeof result.then === 'function') {
            result.finally(() => {
              callback.applyIgnored();
            });
          } else {
            callback.applyIgnored();
          }
        })]);
        return global.fb.runtime.onStop;
      }
    },
    onEvent: {
      addListener: (subject, callback) => {
        api.runtime.onEvent.addListener.applyIgnored(undefined, [subject, new ivm.Reference(callback)]);
        return global.fb.runtime.onEvent;
      }
    },
    emitEvent: (receivers, subject, data = null) => {
      return api.runtime.emitEvent.applySync(
        undefined,
        [
          new ivm.ExternalCopy(receivers).copyInto(),
          subject,
          new ivm.ExternalCopy(data).copyInto()
        ]
      );
    },
    onRequest: {
      addHandler: (subject, callback) => {
        api.runtime.onRequest.addHandler.applyIgnored(undefined, [subject, new ivm.Reference(callback)]);
        return global.fb.runtime.onRequest;
      }
    }
  },
  logger: {
    error: (...args) => api.logger.error.applyIgnored(undefined, args.map(arg => new ivm.ExternalCopy(arg).copyInto())),
    info: (...args) => api.logger.info.applyIgnored(undefined, args.map(arg => new ivm.ExternalCopy(arg).copyInto())),
    warn: (...args) => api.logger.warn.applyIgnored(undefined, args.map(arg => new ivm.ExternalCopy(arg).copyInto())),
    verbose: (...args) => api.logger.verbose.applyIgnored(undefined, args.map(arg => new ivm.ExternalCopy(arg).copyInto())),
    debug: (...args) => api.logger.debug.applyIgnored(undefined, args.map(arg => new ivm.ExternalCopy(arg).copyInto())),
    silly: (...args) => api.logger.silly.applyIgnored(undefined, args.map(arg => new ivm.ExternalCopy(arg).copyInto())),
    setLevel: level => api.logger.setLevel.applyIgnored(undefined, [level])
  },
  cb: {
    onMessage: {
      addHandler: handler => {
        api.cb.onMessage.addHandler.applySync(undefined, [
          new ivm.Reference((type, timestamp, data, callback) => {
            const result = handler(type, timestamp, data);

            if (typeof result === 'object' && typeof result.then === 'function') {
              result.then(
                result => callback.applySync(undefined, [new ivm.ExternalCopy(result).copyInto()]),
                error => callback.applySync()
              );
            } else {
              callback.applySync(undefined, [new ivm.ExternalCopy(result).copyInto()]);
            }
          })
        ]);
        return global.fb.cb.onMessage;
      }
    },
    onAccountActivity: {
      addListener: callback => {
        api.cb.onAccountActivity.addListener.applyIgnored(undefined, [new ivm.Reference(callback)]);
        return global.fb.cb.onAccountActivity;
      }
    },
    onBroadcastStart: {
      addListener: callback => {
        api.cb.onBroadcastStart.addListener.applyIgnored(undefined, [new ivm.Reference(callback)]);
        return global.fb.cb.onBroadcastStart;
      }
    },
    onBroadcastStop: {
      addListener: callback => {
        api.cb.onBroadcastStop.addListener.applyIgnored(undefined, [new ivm.Reference(callback)]);
        return global.fb.cb.onBroadcastStop;
      }
    },
    get isBroadcasting() {
      return api.cb.isBroadcasting.applySync();
    },
    onExtractAccountActivityStart: {
      addListener: callback => {
        api.cb.onExtractAccountActivityStart.addListener.applyIgnored(
          undefined, [new ivm.Reference(callback)]
        );
        return global.fb.cb.onExtractAccountActivityStart;
      }
    },
    onExtractAccountActivityStop: {
      addListener: callback => {
        api.cb.onExtractAccountActivityStop.addListener.applyIgnored(
          undefined, [new ivm.Reference(callback)]
        );
        return global.fb.cb.onExtractAccountActivityStop;
      }
    },
    get isExtractingAccountActivity() {
      return api.cb.isExtractingAccountActivity.applySync();
    },
    sendMessage: message => api.cb.sendMessage.applyIgnored(undefined, [message])
  },
  gallery: {
    onAdd: {
      addListener: callback => {
        api.gallery.onAdd.addListener.applyIgnored(undefined, [new ivm.Reference(callback)]);
        return global.fb.gallery.onAdd;
      }
    },
    onRemove: {
      addListener: callback => {
        api.gallery.onRemove.addListener.applyIgnored(undefined, [new ivm.Reference(callback)]);
        return global.fb.gallery.onRemove;
      }
    },
    playAudio: id => {
      api.gallery.playAudio.applyIgnored(undefined, [id]);
    }
  },
  storage: {
    set: (arg1, arg2) => {
      const pairs = typeof arg1 === 'object' ? arg1 : { [arg1]: arg2 };

      return new Promise((resolve, reject) =>
        api.storage.set.applyIgnored(undefined, [
          new ivm.ExternalCopy(pairs).copyInto(),
          new ivm.Reference(err => err ? reject(objectToError(err)) : resolve())
        ]));
    },
    get: arg1 => {
      const keys = Array.isArray(arg1) ? arg1 : [arg1];

      const result = new Promise((resolve, reject) =>
        api.storage.get.applyIgnored(undefined, [
          new ivm.ExternalCopy(keys).copyInto(),
          new ivm.Reference((err, result) => err ? reject(objectToError(err)) : resolve(result))
        ]));

      return result.then(result => Array.isArray(arg1) ? result : result[arg1]);
    },
    remove: arg1 => {
      const keys = Array.isArray(arg1) ? arg1 : [arg1];

      return new Promise((resolve, reject) =>
        api.storage.remove.applyIgnored(undefined, [
          new ivm.ExternalCopy(keys).copyInto(),
          new ivm.Reference((err, result) => err ? reject(objectToError(err)) : resolve(result))
        ]));
    },
    getAll: () => new Promise((resolve, reject) =>
      api.storage.getAll.applyIgnored(undefined, [
        new ivm.Reference((err, result) => err ? reject(objectToError(err)) : resolve(result))
      ])),
    removeAll: () => new Promise((resolve, reject) =>
      api.storage.removeAll.applyIgnored(undefined, [
        new ivm.Reference((err, result) => err ? reject(objectToError(err)) : resolve(result))
      ])),
    onChanged: {
      addListener: callback => {
        api.storage.onChanged.addListener.applyIgnored(
          undefined, [new ivm.Reference(callback)]
        );
        return api.storage.onChanged;
      }
    }
  }
};
