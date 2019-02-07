const WebSocket = require('ws');
const EventEmitter = require('events');
const https = require('https');
const fs = require('fs-extra');
const RequestTarget = require('@kothique/request-target');

const { CustomError } = require('./errors');
const config = require('./config');

const server = https.createServer({
  key: fs.readFileSync(config.ssl.key),
  cert: fs.readFileSync(config.ssl.cert)
});
server.listen(config.wsAppPort);

const wss = new WebSocket.Server({ server });

wss.broadcast = function (msg) {
  this.clients.forEach(ws => ws.readyState === WebSocket.OPEN && ws.send(msg));
}

wss.on('listening', () => {
  console.log(`WSS App Server: listening on port ${config.wsAppPort}`)
});

const eventHandlers = new EventEmitter;
const requestHandlers = new RequestTarget;

let nextAppId = 0;
const appIds = {};

wss.on('connection', ws => {
  console.log('WSS App Server: client connected.');

  const appId = appIds[ws] = nextAppId++;
  eventHandlers.emit('$open', appId);

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

    const appId = appIds[ws];
    delete appIds[ws];
    eventHandlers.emit('$close', appId);
  });

  ws.on('message', async data => {
    const msg = JSON.parse(data);

    if (msg.type === 'event') {
      const { subject, data } = msg;
      eventHandlers.emit(subject, appId, data);
    } else if (msg.type === 'request') {
      const { subject, requestId, data } = msg;

      try {
        const result = await requestHandlers.request(subject, appId, data);
        const msg = {
          type: 'response',
          requestId,
          ...typeof result !== 'undefined' ? { data: result } : null
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
  emit: (subject, data = null) => {
    const msg = {
      type: 'event',
      subject,
      ...data && { data }
    };

    wss.broadcast(JSON.stringify(msg));
  }
};
