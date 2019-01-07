const path = require('path');

module.exports = {
  port: 8887,
  wsAppPort: 8888,
  wsExtPort: 8889,
  dbPath: path.join(__dirname, '..', 'db')
};
