const { EventEmitter } = require('events');
const ivm = require('isolated-vm');

module.exports.createChaturbateAPI = function createChaturbateAPI(data) {
  const { id, name, version, broadcaster, logger, logError,
    callAction, emitEvent, events } = data;

  const eventHandlers = new EventEmitter;
  const meta = { events };

  events.on('message', meta.messageListener = payload => {
    const { type, info, timestamp, data } = payload;

    if (info.chat.owner === broadcaster) {
      eventHandlers.emit('message', type, new Date(timestamp), data);
    }
  });

  events.on('account-activity', meta.accountActivityListener = payload => {
    const { username, type, timestamp, data } = payload;

    if (username === broadcaster) {
      eventHandlers.emit('account-activity', type, new Date(timestamp), data);
    }
  });

  events.on('broadcast-start', meta.broadcastStartListener = payload => {
    if (payload.broadcaster === broadcaster) {
      eventHandlers.emit('broadcast-start');
    }
  });

  events.on('broadcast-stop', meta.broadcastStopListener = payload => {
    if (payload.broadcaster === broadcaster) {
      eventHandlers.emit('broadcast-stop');
    }
  });

  events.on('extract-account-activity-start', meta.extractAccountActivityStartListener = payload => {
    if (payload.username === broadcaster) {
      eventHandlers.emit('extract-account-activity-start');
    }
  });

  events.on('extract-account-activity-stop', meta.extractAccountActivityStopListener = payload => {
    if (payload.username === broadcaster) {
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
  const { events } = meta;

  events.off('extract-account-activity-stop', meta.extractAccountActivityStopListener);
  events.off('extract-account-activity-start', meta.extractAccountActivityStartListener);
  events.off('broadcast-stop', meta.broadcastStopListener);
  events.off('broadcast-start', meta.broadcastStartListener);
  events.off('account-activity', meta.accountActivityListener);
  events.off('message', meta.messageListener);
};
