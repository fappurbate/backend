const WebSocket = require('ws');
const EventEmitter = require('events');
const config = require('./config');

const wss = new WebSocket.Server({
  port: config.wsExtPort
});

wss.broadcast = function (msg) {
  this.clients.forEach(ws => ws.send(msg));
}

wss.on('listening', () => {
  console.log(`WS Ext Server: listening on port ${config.wsExtPort}`)
});

const messages = new EventEmitter;

wss.on('connection', ws => {
  console.log('WS Ext Server: client connected');

  ws.on('close', (code, reason) => {
    console.log(
      `WS Ext Server: client disconnected with code ${code}${reason ? ` and reason: ${reason}` : ''}.`
    );
  });

  ws.on('message', data => {
    const msg = JSON.parse(data);
    messages.emit(msg.type, msg.data);
  });
});

module.exports = {
  messages,
  sendTranslation(tabId, msgId, translation) {
    const msg = {
      type: 'translation',
      data: { tabId, msgId, translation }
    };

    wss.broadcast(JSON.stringify(msg));
  }
};
