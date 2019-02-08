const { EventEmitter } = require('events');
const ivm = require('isolated-vm');

const wssExt = require('../../common/wss-ext');
const Broadcast = require('../../broadcast');
const ExtractAccountActivity = require('../../extract-account-activity');

module.exports.createChaturbateAPI = function createChaturbateAPI(data) {
  const { id, name, version, broadcaster, logger, logError } = data;

  const eventHandlers = new EventEmitter;
  const meta = {};

  wssExt.events.on('message', meta.messageListener = (extId, data) => {
    const { info, type, timestamp, data: msgData } = data;

    if (info.broadcast.active && info.chat.active && info.chat.owner === broadcaster) {
      eventHandlers.emit('message', type, new Date(timestamp), msgData);
    }
  });

  wssExt.events.on('account-activity', meta.accountActivityListener = (extId, data) => {
    const { username, type, timestamp, data: aaData } = data;

    if (username === broadcaster) {
      eventHandlers.emit('account-activity', type, new Date(timestamp), aaData);
    }
  });

  Broadcast.events.on('start', meta.broadcastStartListener = data => {
    if (data.broadcaster === broadcaster) {
      eventHandlers.emit('broadcast-start');
    }
  });

  Broadcast.events.on('stop', meta.broadcastStopListener = data => {
    if (data.broadcaster === broadcaster) {
      eventHandlers.emit('broadcast-stop');
    }
  });

  ExtractAccountActivity.events.on('start', meta.extractAccountActivityStartListener = data => {
    if (data.username === broadcaster) {
      eventHandlers.emit('extract-account-activity-start');
    }
  });

  ExtractAccountActivity.events.on('stop', meta.extractAccountActivityStopListener = data => {
    if (data.username === broadcaster) {
      eventHandlers.emit('extract-account-activity-stop');
    }
  });

  const api = {
    onMessage: {
      addListener: new ivm.Reference(cbRef => {
        eventHandlers.on('message', (type, timestamp, data) => cbRef.apply(
          undefined,
          [
            type,
            new ivm.ExternalCopy(timestamp).copyInto(),
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
    isBroadcasting: new ivm.Reference(() => Broadcast.isBroadcasting(broadcaster)),
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
    },
    isExtractingAccountActivity: new ivm.Reference(() => ExtractAccountActivity.isExtracting(broadcaster)),
    sendMessage: new ivm.Reference(message => Broadcast.sendMessage(broadcaster, message))
  };

  return { api, meta };
};

module.exports.disposeChaturbateAPI = function disposeChaturbateAPI(meta) {
  ExtractAccountActivity.events.off('stop', meta.extractAccountActivityStopListener);
  ExtractAccountActivity.events.off('start', meta.extractAccountActivityStartListener);
  Broadcast.events.off('stop', meta.broadcastStopListener);
  Broadcast.events.off('start', meta.broadcastStartListener);
  wssExt.events.off('account-activity', meta.accountActivityListener);
  wssExt.events.off('message', meta.messageListener);
};
