const { EventEmitter } = require('events');
const ivm = require('isolated-vm');

const RequestTarget = require('../../common/request-target');
const wssApp = require('../../wss-app');

module.exports.createRuntimeAPI = function createRuntimeAPI(data) {
  const { id, name, version, broadcaster, logger } = data;

  const eventHandlers = new EventEmitter;
  const requestHandlers = new RequestTarget;

  const meta = {};

  wssApp.events.on('extension-event', meta.listener = event => {
    if (event.detail.id !== id || event.detail.broadcaster !== broadcaster ||
        !event.detail.receivers.includes('@main')) {
      return;
    }

    const { sender, subject, data } = event.detail;

    eventHandlers.emit(subject, { sender, data });
  });

  const api = {
    id, name, version, broadcaster,
    events: {
      on: new ivm.Reference((subject, cbRef) => {
        eventHandlers.on(subject, data => cbRef.applyIgnored(
          undefined,
          [new ivm.ExternalCopy(data).copyInto()]
        ));

      }),
      emit: new ivm.Reference((receivers, subject, data = null) => {
        const mainScriptIndex = receivers.indexOf('@main');

        if (mainScriptIndex !== -1) {
          eventHandlers.emit(subject, { sender: '@main', data });
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
      })
    }
  };

  return { api, meta };
};

module.exports.disposeRuntimeAPI = function disposeRuntimeAPI(meta) {
  wssApp.events.off('extension-event', meta.listener);
};
