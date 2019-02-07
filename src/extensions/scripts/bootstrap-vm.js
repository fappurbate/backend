const ivm = _ivm;
delete _ivm;

const api = _api;
delete _api;

global.kck = {
  runtime: {
    id: api.runtime.id,
    name: api.runtime.name,
    version: api.runtime.version,
    broadcaster: api.runtime.broadcaster,
    onEvent: {
      addListener: (subject, callback) => {
        api.runtime.onEvent.addListener.applyIgnored(undefined, [subject, new ivm.Reference(callback)]);
        return global.kck.runtime.onEvent;
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
        return global.kck.runtime.onRequest;
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
      addListener: callback => {
        api.cb.onMessage.addListener.applyIgnored(undefined, [new ivm.Reference(callback)]);
        return global.kck.cb.onMessage;
      }
    },
    onAccountActivity: {
      addListener: callback => {
        api.cb.onAccountActivity.addListener.applyIgnored(undefined, [new ivm.Reference(callback)]);
        return global.kck.cb.onAccountActivity;
      }
    },
    onBroadcastStart: {
      addListener: callback => {
        api.cb.onBroadcastStart.addListener.applyIgnored(undefined, [new ivm.Reference(callback)]);
        return global.kck.cb.onBroadcastStart;
      }
    },
    onBroadcastStop: {
      addListener: callback => {
        api.cb.onBroadcastStop.addListener.applyIgnored(undefined, [new ivm.Reference(callback)]);
        return global.kck.cb.onBroadcastStop;
      }
    }
  }
};
