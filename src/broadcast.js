const { EventEmitter } = require('events');

const wssExt = require('./common/wss-ext');
const wssApp = require('./common/wss-app');

const eventHandlers = new EventEmitter;
const broadcastsByExtId = {};

wssExt.events.on('$open', extId => {
  broadcastsByExtId[extId] = {};
});

wssExt.events.on('$close', extId => {
  Object.keys(broadcastsByExtId[extId]).forEach(broadcaster => {
    wssApp.emit('broadcast-stop', { broadcaster });
    eventHandlers.emit('stop', { broadcaster });
  });
  delete broadcastsByExtId[extId];
});

wssExt.events.on('broadcast-start', (extId, data) => {
  const { broadcaster } = data;

  wssApp.emit('broadcast-start', { broadcaster });
  eventHandlers.emit('start', { broadcaster });

  if (broadcaster in broadcastsByExtId[extId]) {
    broadcastsByExtId[extId][broadcaster]++;
  } else {
    broadcastsByExtId[extId][broadcaster] = 1;
  }
});

wssExt.events.on('broadcast-stop', (extId, data) => {
  const { broadcaster } = data;

  wssApp.emit('broadcast-stop', { broadcaster });
  eventHandlers.emit('stop', { broadcaster });

  if (!broadcastsByExtId[extId][broadcaster]) { return; }

  if (--broadcastsByExtId[extId][broadcaster] === 0) {
    delete broadcastsByExtId[extId][broadcaster];
  }
});

/** @return {number} - The amount of active broadcasts for this user.
 * That's not possible by how CB works, but we still may get multiple
 * sequential 'broadcast-start' events somehow.
 */
function isBroadcasting(broadcaster) {
  let count = 0;

  Object.values(broadcastsByExtId).forEach(obj =>
    Object.entries(obj).forEach(([_broadcaster, _count]) => {
      if (_broadcaster === broadcaster) {
        count += _count;
      }
    }));

  return count;
}

function sendMessage(broadcaster, message) {
  Object.entries(broadcastsByExtId).forEach(([extId, broadcasts]) => {
    if (broadcaster in broadcasts) {
      wssExt.emit(extId, 'send-message', {
        broadcaster,
        message
      });
    }
  });
}

module.exports = {
  events: eventHandlers,
  isBroadcasting,
  sendMessage
};
