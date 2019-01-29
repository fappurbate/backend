const Datastore = require('nedb-promises');
const path = require('path');

const config = require('./config');

const createStore = name => Datastore.create(
  path.join(config.dbPath, `${name}.nedb`)
);

const stores = {
  broadcasters: createStore('broadcasters'),
  extensions: createStore('extensions'),
  translationRequests: createStore('translation_requests')
};

async function ensureBroadcaster(broadcaster) {
  await stores.broadcasters.update({ username: broadcaster }, { $set: {} }, { upsert: true });
}

// function factoryGetStore(name, options = {}) {
//   const { numArgs } = options;
//
//   if (!stores[name]) {
//     stores[name] = {};
//   }
//
//   return async (...args) => {
//     if (numArgs && args.length !== numArgs) {
//       throw new Error(`Expected ${numArg} parameters, got ${args.length}.`);
//     }
//
//     const key = args.join('::');
//     return stores[name][key] ||
//       (stores[name][key] = createStore(`${name}_${key}`))
//   };
// }

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
  // extensionLogs: factoryGetBroadcasterStore('extension_logs'),
  tippers: factoryGetBroadcasterStore('tippers')
};
