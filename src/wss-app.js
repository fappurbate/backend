const WebSocket = require('ws');
const EventEmitter = require('events');
const https = require('https');
const fs = require('fs');
const config = require('./config');

const server = https.createServer({
  key: fs.readFileSync(config.ssl.key),
  cert: fs.readFileSync(config.ssl.cert)
});
server.listen(config.wsAppPort);

const wss = new WebSocket.Server({ server });

wss.broadcast = function (msg) {
  this.clients.forEach(ws => ws.send(msg));
}

wss.on('listening', () => {
  console.log(`WSS App Server: listening on port ${config.wsAppPort}`)
});

const events = new EventEmitter;

wss.on('connection', ws => {
  console.log('WSS App Server: client connected');

  ws.on('close', (code, reason) => {
    console.log(
      `WSS App Server: client disconnected with code ${code}${reason ? ` and reason: ${reason}` : ''}.`
    );
  });

  ws.on('message', data => {
    const msg = JSON.parse(data);

    if (msg.type === 'event') {
      const { subject, data } = msg;
      events.emit(subject, data);
    } else if (msg.type === 'request') {
      // TODO ...
    } else if (msg.type === 'response') {
      // TODO ...
    }
  });
});

module.exports = {
  events,
  sendTip: (broadcaster, tipper, amount) => {
    const msg = {
      type: 'event',
      subject: 'tip',
      data: { broadcaster, tipper, amount }
    };

    wss.broadcast(JSON.stringify(msg));
  },
  sendTranslationRequest: (tabId, msgId, content) => {
    const msg = {
      type: 'event',
      subject: 'request-translation',
      data: { tabId, msgId, content }
    };

    wss.broadcast(JSON.stringify(msg));
  },
  sendCancelTranslationRequest: (tabId, msgId) => {
    const msg = {
      type: 'event',
      subject: 'request-cancel-translation',
      data: { tabId, msgId }
    };

    wss.broadcast(JSON.stringify(msg));
  }
};
