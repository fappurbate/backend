const { EventEmitter } = require('events');

const wssExt = require('./common/wss-ext');
const wssApp = require('./common/wss-app');

const eventHandlers = new EventEmitter;
const extractAccountActivityByExtId = {};

wssExt.events.on('$open', extId => {
  extractAccountActivityByExtId[extId] = {};
});

wssExt.events.on('$close', extId => {
  Object.keys(extractAccountActivityByExtId[extId]).forEach(username => {
    wssApp.broadcast('extract-account-activity-stop', { username });
    eventHandlers.emit('stop', { username });
  });
  delete extractAccountActivityByExtId[extId];
});

wssExt.events.on('extract-account-activity-start', (extId, data) => {
  const { username } = data;

  wssApp.broadcast('extract-account-activity-start', { username });
  eventHandlers.emit('start', { username });

  if (extractAccountActivityByExtId[extId][username]) {
    extractAccountActivityByExtId[extId][username]++;
  } else {
    extractAccountActivityByExtId[extId][username] = 1;
  }
});

wssExt.events.on('extract-account-activity-stop', (extId, data) => {
  const { username } = data;

  wssApp.broadcast('extract-account-activity-stop', { username });
  eventHandlers.emit('stop', { username });

  if (--extractAccountActivityByExtId[extId][username] === 0) {
    delete extractAccountActivityByExtId[extId][username];
  }
});

/** @return {number} - The amount of active extractions for this user. */
function isExtracting(username) {
  let count = 0;

  Object.values(extractAccountActivityByExtId).forEach(obj =>
    Object.entries(obj).forEach(([_username, _count]) => {
      if (_username === username) {
        count += _count;
      }
    }));

  return count;
}

module.exports = {
  events: eventHandlers,
  isExtracting
};
