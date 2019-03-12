const { EventEmitter } = require('events');
const ivm = require('isolated-vm');
const RequestTarget = require('@kothique/request-target');

module.exports.createRuntimeAPI = function createRuntimeAPI(data) {
  const { id, name, version, broadcaster, logger, logError,
    callAction, emitEvent, events, requests } = data;

  const eventHandlers = new EventEmitter;
  const requestHandlers = new RequestTarget({
    callAllHandlers: true
  });

  const meta = { events, requests };

  // TODO: fix clash between onEvent('start', ...) and onStart.addListener(...)
  // and between onRequest('stop', ...) and onStop.addHandler(...)
  events.on('start', meta.startListener = () => eventHandlers.emit('start'));

  requests.on('stop', meta.stopHandler = () => requestHandlers.request('stop'));

  events.on('event', meta.eventListener = payload => {
    if (payload.id !== id || payload.broadcaster !== broadcaster) {
      return;
    }

    const { sender, subject, data } = payload;
    eventHandlers.emit(subject, sender, data);
  });

  requests.on('request', meta.requestHandler = payload => {
    if (payload.id !== id || payload.broadcaster !== broadcaster) {
      return;
    }

    const { sender, subject, data } = payload;
    return requestHandlers.request(subject, sender, data);
  });

  const api = {
    id, name, version, broadcaster,
    onStart: {
      addListener: new ivm.Reference(cbRef => {
        eventHandlers.on('start', () => cbRef.apply(
          undefined,
          []
        ).catch(logError));
      })
    },
    onStop: {
      addHandler: new ivm.Reference(handlerRef => {
        requestHandlers.on('stop', () => new Promise(resolve =>
          handlerRef.apply(undefined, [new ivm.Reference(resolve)]).catch(logError)
        ))
      })
    },
    onEvent: {
      addListener: new ivm.Reference((subject, cbRef) => {
        eventHandlers.on(subject, (sender, data) => cbRef.apply(
          undefined,
          [
            sender,
            new ivm.ExternalCopy(data).copyInto()
          ]
        ).catch(logError));
      })
    },
    emitEvent: new ivm.Reference((receivers, subject, data = null) => {
      const mainScriptIndex = receivers.indexOf('@main');

      if (mainScriptIndex !== -1) {
        eventHandlers.emit(subject, '@main', data);
        receivers.splice(mainScriptIndex, 1);
      }

      if (receivers.length === 0) { return; }

      callAction('gateway.app.broadcast', {
        subject: 'extension-event',
        data: {
          id,
          broadcaster,
          receivers,
          sender: '@main',
          subject,
          ...data && { data }
        }
      });
    }),
    onRequest: {
      addHandler: new ivm.Reference((subject, cbRef) => {
        requestHandlers.on(subject, (sender, data) => cbRef.apply(
          undefined,
          [
            sender,
            new ivm.ExternalCopy(data).copyInto()
          ]
        ).catch(logError));
      })
    }
  };

  return { api, meta };
};

module.exports.disposeRuntimeAPI = function disposeRuntimeAPI(meta) {
  const { events, requests } = meta;

  requests.off('request', meta.requestHandler);
  events.off('event', meta.eventListener);
  requests.off('stop', meta.stopHandler);
  events.off('start', meta.startListener);
};
