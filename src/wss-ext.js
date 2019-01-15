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

const events = new EventEmitter;

wss.on('connection', ws => {
  console.log('WS Ext Server: client connected');

  ws.on('close', (code, reason) => {
    console.log(
      `WS Ext Server: client disconnected with code ${code}${reason ? ` and reason: ${reason}` : ''}.`
    );
  });

  ws.on('message', data => {
    const msg = JSON.parse(data);

    if (msg.type === 'event') {
      const { subject, data } = msg;
      events.emit(subject, data);
    } else if (msg.type === 'request') {
      const { subject, requestId } = msg;
      // TODO ...
    } else if (msg.type === 'response') {
      const { subject, requestId } = msg;
      // TODO ...
    }
  });
});

module.exports = {
  events,
  sendTranslation(tabId, msgId, content) {
    const msg = {
      type: 'event',
      subject: 'translation',
      data: { tabId, msgId, content }
    };

    wss.broadcast(JSON.stringify(msg));
  }
};
