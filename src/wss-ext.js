const WebSocket = require('ws');
const EventEmitter = require('events');
const { CustomError } = require('./errors');
const RequestTarget = require('./util/request-target');
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

const eventHandlers = new EventEmitter;
const requestHandlers = new RequestTarget;

const requests = {};

wss.on('connection', ws => {
  console.log('WS Ext Server: client connected.');

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
      `WS Ext Server: client disconnected with code ${code}${reason ? ` and reason: ${reason}` : ''}.`
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
  sendTranslation(tabId, msgId, content) {
    const msg = {
      type: 'event',
      subject: 'translation',
      data: { tabId, msgId, content }
    };

    wss.broadcast(JSON.stringify(msg));
  }
};
