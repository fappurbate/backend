const path = require('path');

module.exports = {
  port: 8887,
  wsAppPort: 8888,
  wsAppHost: '192.168.0.101',
  wsExtPort: 8889,
  dbPath: path.join(__dirname, '..', 'db'),
  ssl: {
    key: 'C:\\Users\\kothique\\Documents\\privateKey.key',
    cert: 'C:\\Users\\kothique\\Documents\\certificate.crt',
  }
};
