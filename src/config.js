const path = require('path');
const fs = require('fs');
const lodash = require('lodash');

const config = (() => {
  let content;

  try {
    content = fs.readFileSync(path.join(__dirname, '..', 'config.json'));

    try {
      return JSON.parse(content);
    } catch (error) {
      console.error(`Failed to parse config file:`, error);
      process.exit(1);
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log(`Config file not found. Using default values.`);
      return {};
    } else {
      throw error;
    }
  }
})();

const result = module.exports = lodash.merge(
  {
    port: 8887,
    wsAppPort: 8888,
    wsExtPort: 8889,
    dbPath: './db'
  },
  config,
  {
    port: process.env.HTTP_PORT,
    wsAppPort: process.env.WS_APP_PORT,
    wsExtPort: process.env.WS_EXT_PORT,
    dbPath: process.env.DB_PATH,
    ssl: {
      key: process.env.SSL_KEY,
      cert: process.env.SSL_CERT
    }
  },
);


if (!result.ssl || !result.ssl.key || !result.ssl.cert) {
  console.error(`Error: ssl.key and ssl.cert must be specified in config.`);
  process.exit(1);
}

result.dbPath = path.join(__dirname, '..', result.dbPath);
result.ssl.key = path.join(__dirname, '..', result.ssl.key);
result.ssl.cert = path.join(__dirname, '..', result.ssl.cert);
