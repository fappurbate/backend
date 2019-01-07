const WebSocket = require('ws');
const config = require('./config');

const wss = new WebSocket.Server({
  port: config.wsPort
});

wss.broadcast = function (msg) {
  this.clients.forEach(ws => ws.send(msg));
}

wss.on('listening', () => {
  console.log(`WS Server: listening on port ${config.wsPort}`)
});

wss.on('connection', ws => {
  console.log('WS Server: client connected');

  ws.on('close', (code, reason) => {
    console.log(
      `WS Server: client disconnected with code ${code}${reason ? ` and reason: ${reason}` : ''}.`
    );
  });
});

module.exports = {
  sendTip: (broadcaster, tipper, amount) => {
    const msg = {
      type: 'tip',
      data: { broadcaster, tipper, amount }
    };

    wss.broadcast(JSON.stringify(msg));
  }
};
