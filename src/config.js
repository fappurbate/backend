const path = require('path');

module.exports = {
  port: 8887,
  wsPort: 8888,
  dbPath: path.join(__dirname, '..', 'db')
};
