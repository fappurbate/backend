const { EventEmitter } = require('events');
const ivm = require('isolated-vm');

const wssExt = require('../../wss-ext');

module.exports.createChaturbateAPI = function createChaturbateAPI(data) {
  const { id, name, version, broadcaster, logger } = data;

  const eventHandlers = new EventEmitter;

  const meta = {};

  wssExt.events.on('message', meta.messageListener = data => {
    const { info, type, data: msgData } = data;

    if (info.broadcast.active && info.chat.active && info.chat.ready && info.chat.owner === broadcaster) {
      eventHandlers.emit('message', type, msgData);
    }
  });

  wssExt.events.on('account-activity', meta.accountActivityListener = data => {
    const { username, type, data: aaData } = data;

    if (username === broadcaster) {
      eventHandlers.emit('account-activity', type, aaData);
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
    },
    onAccountActivity: {
      addListener: new ivm.Reference(cbRef => {
        eventHandlers.on('account-activity', (type, data) => cbRef.applyIgnored(
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
  wssExt.events.off('message', meta.accountActivityListener);
  wssExt.events.off('message', meta.messageListener);
};
