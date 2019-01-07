const WebSocket = require('ws');
const EventEmitter = require('events');
const config = require('./config');

const wss = new WebSocket.Server({
  port: config.wsAppPort
});

wss.broadcast = function (msg) {
  this.clients.forEach(ws => ws.send(msg));
}

wss.on('listening', () => {
  console.log(`WS App Server: listening on port ${config.wsAppPort}`)
});

const messages = new EventEmitter;

wss.on('connection', ws => {
  console.log('WS App Server: client connected');

  ws.on('close', (code, reason) => {
    console.log(
      `WS App Server: client disconnected with code ${code}${reason ? ` and reason: ${reason}` : ''}.`
    );
  });

  ws.on('message', data => {
    const msg = JSON.parse(data);
    messages.emit(msg.type, msg.data);
  });
});

module.exports = {
  messages,
  sendTip: (broadcaster, tipper, amount) => {
    const msg = {
      type: 'tip',
      data: { broadcaster, tipper, amount }
    };

    wss.broadcast(JSON.stringify(msg));
  },
  sendTranslationRequest: (tabId, msgId, content) => {
    const msg = {
      type: 'translation-request',
      data: { tabId, msgId, content }
    };

    wss.broadcast(JSON.stringify(msg));
  }
};
