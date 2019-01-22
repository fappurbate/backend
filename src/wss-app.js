const WebSocket = require('ws');
const EventEmitter = require('events');
const { CustomError } = require('./common/errors');
const RequestTarget = require('./common/request-target');
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

const eventHandlers = new EventEmitter;
const requestHandlers = new RequestTarget;

wss.on('connection', ws => {
  console.log('WSS App Server: client connected.');

  let nextRequestId = 0;
  const requests = {};

  ws.request = async function (subject, data) {
    const requestId = nextRequestId++;
    const msg = {
      type: 'request',
      requestId,
      subject,
      ...data && { data }
    };

    ws.send(JSON.stringify(msg));

    return new Promise((resolve, reject) => {
      requests[requestId] = {
        succeed: resolve,
        fail: reject
      };
    });
  };

  ws.on('close', (code, reason) => {
    console.log(
      `WSS App Server: client disconnected with code ${code}${reason ? ` and reason: ${reason}` : ''}.`
    );
  });

  ws.on('message', async data => {
    const msg = JSON.parse(data);

    if (msg.type === 'event') {
      const { subject, data } = msg;
      eventHandlers.emit(subject, data);
    } else if (msg.type === 'request') {
      const { subject, requestId, data } = msg;

      try {
        const result = await requestHandlers.request(subject, data);
        const msg = {
          type: 'response',
          requestId,
          ...result && { data: result }
        };

        ws.send(JSON.stringify(msg));
      } catch (error) {
        const msg = {
          type: 'response',
          requestId,
          error: error.message,
          ...error.data && { data: error.data }
        };

        ws.send(JSON.stringify(msg));
      }
    } else if (msg.type === 'response') {
      const { subject, requestId } = msg;

      const callbacks = requests[requestId];
      if (!callbacks) {
        console.warn(`Got response to unknown request: ${requestId}.`);
        return;
      } else {
        delete requests[requestId];
      }
      const { succeed, fail } = callbacks;

      if (msg.error) {
        const { error, data } = msg;
        fail(new CustomError(error, data));
      } else {
        const { data } = msg;
        succeed(data);
      }
    }
  });
});

module.exports = {
  events: eventHandlers,
  requests: requestHandlers,
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
