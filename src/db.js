const Datastore = require('nedb-promises');
const path = require('path');
const config = require('./config');

module.exports = {
  tippers: Datastore.create(path.join(config.dbPath, 'tippers.nedb'))
};
