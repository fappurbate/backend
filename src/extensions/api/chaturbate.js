const { EventEmitter } = require('events');
const ivm = require('isolated-vm');

const wssExt = require('../../wss-ext');

module.exports.createChaturbateAPI = function createChaturbateAPI(data) {
  const { id, name, version, broadcaster, logger, logError } = data;

  const eventHandlers = new EventEmitter;
  const meta = {};

  wssExt.events.on('message', meta.messageListener = (extId, data) => {
    const { info, type, data: msgData } = data;

    if (info.broadcast.active && info.chat.active && info.chat.ready && info.chat.owner === broadcaster) {
      eventHandlers.emit('message', type, msgData);
    }
  });

  wssExt.events.on('account-activity', meta.accountActivityListener = (extId, data) => {
    const { username, type, timestamp, data: aaData } = data;

    if (username === broadcaster) {
      eventHandlers.emit('account-activity', type, new Date(timestamp), aaData);
    }
  });

  const broadcastingExtIds = new Set;

  wssExt.events.on('broadcast-start', meta.broadcastStartListener = (extId, data) => {
    if (data.broadcaster === broadcaster) {
      eventHandlers.emit('broadcast-start');
      broadcastingExtIds.add(extId);
    }
  });

  wssExt.events.on('broadcast-stop', meta.broadcastStopListener = (extId, data) => {
    if (data.broadcaster === broadcaster) {
      eventHandlers.emit('broadcast-stop');
      broadcastingExtIds.delete(extId);
    }
  });

  const extractingAccountActivityExtIds = new Set;

  wssExt.events.on('extract-account-activity-start', meta.extractAccountActivityStartListener = (extId, data) => {
    if (data.username === broadcaster) {
      eventHandlers.emit('extract-account-activity-start');
      extractingAccountActivityExtIds.add(extId);
    }
  });

  wssExt.events.on('extract-account-activity-stop', meta.extractAccountActivityStopListener = (extId, data) => {
    if (data.username === broadcaster) {
      eventHandlers.emit('extract-account-activity-stop');
      extractingAccountActivityExtIds.delete(extId);
    }
  });

  wssExt.events.on('$close', meta.extCloseListener = extId => {
    if (broadcastingExtIds.has(extId)) {
      eventHandlers.emit('broadcast-stop');
      broadcastingExtIds.delete(extId);
    }

    if (extractingAccountActivityExtIds.has(extId)) {
      eventHandlers.emit('extract-account-activity-stop');
      extractingAccountActivityExtIds.delete(extId);
    }
  });

  const api = {
    onMessage: {
      addListener: new ivm.Reference(cbRef => {
        eventHandlers.on('message', (type, data) => cbRef.apply(
          undefined,
          [
            type,
            new ivm.ExternalCopy(data).copyInto()
          ]
        ).catch(logError));
      })
    },
    onAccountActivity: {
      addListener: new ivm.Reference(cbRef => {
        eventHandlers.on('account-activity', (type, timestamp, data) => cbRef.apply(
          undefined,
          [
            type,
            new ivm.ExternalCopy(timestamp).copyInto(),
            new ivm.ExternalCopy(data).copyInto()
          ]
        ).catch(logError));
      })
    },
    onBroadcastStart: {
      addListener: new ivm.Reference(cbRef => {
        eventHandlers.on('broadcast-start', () => cbRef.apply(undefined, []).catch(logError));
      })
    },
    onBroadcastStop: {
      addListener: new ivm.Reference(cbRef => {
        eventHandlers.on('broadcast-stop', () => cbRef.apply(undefined, []).catch(logError));
      })
    },
    onExtractAccountActivityStart: {
      addListener: new ivm.Reference(cbRef => {
        eventHandlers.on('extract-account-activity-start', () => cbRef.apply(undefined, []).catch(logError));
      })
    },
    onExtractAccountActivityStop: {
      addListener: new ivm.Reference(cbRef => {
        eventHandlers.on('extract-account-activity-stop', () => cbRef.apply(undefined, []).catch(logError));
      })
    }
  };

  return { api, meta };
};

module.exports.disposeChaturbateAPI = function disposeChaturbateAPI(meta) {
  wssExt.events.off('$close', meta.extCloseListener);
  wssExt.events.off('extract-account-activity-stop', meta.extractAccountActivityStopListener);
  wssExt.events.off('extract-account-activity-start', meta.extractAccountActivityStartListener);
  wssExt.events.off('broadcast-stop', meta.broadcastStopListener);
  wssExt.events.off('broadcast-start', meta.broadcastStartListener);
  wssExt.events.off('account-activity', meta.accountActivityListener);
  wssExt.events.off('message', meta.messageListener);
};
