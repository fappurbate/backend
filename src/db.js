const Datastore = require('nedb-promises');
const path = require('path');
const config = require('./config');

const createStore = name => Datastore.create(path.join(config.dbPath, `${name}.nedb`));

const stores = {
  broadcasters: createStore('broadcasters')
};

async function addBroadcaster(broadcaster) {
  if (!await stores.broadcasters.findOne({ username: broadcaster })) {
    await stores.broadcasters.insert({ username: broadcaster });
    console.log(`Added new broadcaster: ${broadcaster}`);
  }
}

function factoryGetBroadcasterStore(name) {
  if (!stores[name]) {
    stores[name] = {};
  }

  return async broadcaster => {
    await addBroadcaster(broadcaster);

    return stores[name][broadcaster]
      || (stores[name][broadcaster] = createStore(`${broadcaster}_${name}`));
  };
}

module.exports = {
  broadcasters: createStore('broadcasters'),
  tippers: factoryGetBroadcasterStore('tippers')
};
