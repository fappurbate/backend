const { EventEmitter } = require('events');
const ivm = require('isolated-vm');
const RequestTarget = require('@kothique/request-target');

const wssApp = require('../../wss-app');

module.exports.createRuntimeAPI = function createRuntimeAPI(data) {
  const { id, name, version, broadcaster, logger } = data;

  const eventHandlers = new EventEmitter;
  const requestHandlers = new RequestTarget;

  const meta = {};

  wssApp.events.on('extension-event', data => {
    if (data.id !== id || data.broadcaster !== broadcaster || !data.receivers.includes('@main')) {
      return;
    }

    eventHandlers.emit(data.subject, data.sender, data.data);
  });

  wssApp.requests.on('extension-request', meta.requestListener = data => {
    if (data.id !== id || data.broadcaster !== broadcaster ||
        !data.receivers.includes('@main')) {
      return;
    }

    return requestHandlers.request(data.subject, data.sender, data.data);
  });

  const api = {
    id, name, version, broadcaster,
    onEvent: {
      addListener: new ivm.Reference((subject, cbRef) =>
        eventHandlers.on(subject, (sender, data) => cbRef.applyIgnored(
          undefined,
          [
            sender,
            new ivm.ExternalCopy(data).copyInto()
          ]
        ))
      )
    },
    emitEvent: new ivm.Reference((receivers, subject, data = null) => {
      const mainScriptIndex = receivers.indexOf('@main');

      if (mainScriptIndex !== -1) {
        eventHandlers.emit(subject, '@main', data);
        receivers.splice(mainScriptIndex, 1);
      }

      if (receivers.length === 0) { return; }

      wssApp.emit('extension-event', {
        id,
        broadcaster,
        receivers,
        sender: '@main',
        subject,
        ...data && { data }
      });
    }),
    onRequest: {
      addListener: new ivm.Reference((subject, cbRef) =>
        requestHandlers.on(subject, (sender, data) => cbRef.apply(
          undefined,
          [
            sender,
            new ivm.ExternalCopy(data).copyInto()
          ]
        ))
      )
    }
  };

  return { api, meta };
};

module.exports.disposeRuntimeAPI = function disposeRuntimeAPI(meta) {
  // wssApp.events.off('extension-event', meta.eventListener);
  // wssApp.requests.off('extension-request', meta.requestListener);
};