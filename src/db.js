const Datastore = require('nedb-promises');
const path = require('path');
const config = require('./config');

const createStore = name => Datastore.create(path.join(config.dbPath, `${name}.nedb`));

const stores = {
  broadcasters: createStore('broadcasters'),
  extensions: createStore('extensions'),
  translationRequests: createStore('translation_requests')
};

async function ensureBroadcaster(broadcaster) {
  await stores.broadcasters.update({ username: broadcaster }, { $set: {} }, { upsert: true });
}

function factoryGetBroadcasterStore(name) {
  if (!stores[name]) {
    stores[name] = {};
  }

  return async broadcaster => {
    await ensureBroadcaster(broadcaster);

    return stores[name][broadcaster]
      || (stores[name][broadcaster] = createStore(`${broadcaster}_${name}`));
  };
}

module.exports = {
  broadcasters: stores.broadcasters,
  translationRequests: stores.translationRequests,
  extensions: stores.extensions,
  tippers: factoryGetBroadcasterStore('tippers')
};
