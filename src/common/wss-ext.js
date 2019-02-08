const WebSocket = require('ws');
const EventEmitter = require('events');
const RequestTarget = require('@kothique/request-target');

const { CustomError } = require('./errors');
const config = require('./config');

const wss = new WebSocket.Server({
  port: config.wsExtPort
});

wss.broadcast = function (msg) {
  this.clients.forEach(ws => ws.send(msg));
};

wss.on('listening', () => {
  console.log(`WS Ext Server: listening on port ${config.wsExtPort}`);
});

const eventHandlers = new EventEmitter;
const requestHandlers = new RequestTarget;

let nextExtId = 0;
const extIds = {};
const wsByExtId = {};

wss.on('connection', ws => {
  console.log('WS Ext Server: client connected.');

  const extId = extIds[ws] = nextExtId++;
  wsByExtId[extId] = ws;
  eventHandlers.emit('$open', extId);

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
    const extId = extIds[ws];
    delete extIds[ws];
    delete wsByExtId[extId];

    eventHandlers.emit('$close', extId);

    console.log(
      `WS Ext Server: client disconnected with code ${code}${reason ? ` and reason: ${reason}` : ''}.`
    );
  });

  ws.on('message', async data => {
    const msg = JSON.parse(data);

    if (msg.type === 'event') {
      const { subject, data } = msg;
      eventHandlers.emit(subject, extId, data);
    } else if (msg.type === 'request') {
      const { subject, requestId, data } = msg;

      try {
        const result = await requestHandlers.request(subject, extId, data);
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
  broadcast(subject, data = null) {
    const msg = {
      type: 'event',
      subject,
      ...data && { data }
    };

    wss.broadcast(JSON.stringify(msg));
  },
  emit(extId, subject, data = null) {
    const ws = wsByExtId[extId];
    if (!ws) {
      console.debug(`No WS client found with id ${extId}.`);
      return;
    }

    const msg = {
      type: 'event',
      subject,
      ...data && { data }
    };

    ws.send(JSON.stringify(msg));
  }
};
