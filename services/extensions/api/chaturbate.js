const { EventEmitter } = require('events');
const ivm = require('isolated-vm');
const RequestTarget = require('@kothique/request-target');

module.exports.createChaturbateAPI = function createChaturbateAPI(data) {
  const { id, name, version, broadcaster, logger, logError,
    callAction, emitEvent, events, requests,
    isBroadcasting, isExtractingAccountActivity } = data;

  const eventHandlers = new EventEmitter;
  const requestHandlers = new RequestTarget({
    byRequest: {
      message: { getAllResults: true }
    }
  });
  const meta = { events, requests };

  requests.on('message', meta.messageHandler = payload => {
    const { type, info, timestamp, data } = payload;

    if (info.chat.owner === broadcaster) {
      return requestHandlers.request('message', type, new Date(timestamp), data);
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
      addHandler: new ivm.Reference(handlerRef => {
        requestHandlers.on('message', (type, timestamp, data) => new Promise(resolve =>
          handlerRef.apply(
            undefined,
            [
              type,
              new ivm.ExternalCopy(timestamp).copyInto(),
              new ivm.ExternalCopy(data).copyInto(),
              new ivm.Reference(resolve)
            ]
          ).catch(error => {
            logError(error);
            resolve({});
          })
        ));
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
    isBroadcasting: new ivm.Reference(() => isBroadcasting(broadcaster)),
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
    isExtractingAccountActivity: new ivm.Reference(() => isExtractingAccountActivity(broadcaster)),
    sendMessage: new ivm.Reference(message => callAction('broadcasters.sendMessage', { broadcaster, message }))
  };

  return { api, meta };
};

module.exports.disposeChaturbateAPI = function disposeChaturbateAPI(meta) {
  const { events, requests } = meta;

  events.off('extract-account-activity-stop', meta.extractAccountActivityStopListener);
  events.off('extract-account-activity-start', meta.extractAccountActivityStartListener);
  events.off('broadcast-stop', meta.broadcastStopListener);
  events.off('broadcast-start', meta.broadcastStartListener);
  events.off('account-activity', meta.accountActivityListener);
  requests.off('message', meta.messageHandler);
};
