const { EventEmitter } = require('events');
const ivm = require('isolated-vm');

const wssExt = require('../../wss-ext');

module.exports.createChaturbateAPI = function createChaturbateAPI(data) {
  const { id, name, version, broadcaster, logger } = data;

  const eventHandlers = new EventEmitter;

  const meta = {};

  wssExt.events.on('message', meta.listener = data => {
    const { info, type, data: msgData } = data;

    if (info.broadcast.active && info.chat.active && info.chat.ready && info.chat.owner === broadcaster) {
      eventHandlers.emit('message', type, msgData);
    }
  });

  const api = {
    onMessage: {
      addListener: new ivm.Reference(cbRef => {
        eventHandlers.on('message', (type, data) => cbRef.applyIgnored(
          undefined,
          [
            type,
            new ivm.ExternalCopy(data).copyInto()
          ]
        ));
      })
    }
  };

  return { api, meta };
};

module.exports.disposeChaturbateAPI = function disposeChaturbateAPI(meta) {
  wssExt.events.off('message', meta.listener);
};
