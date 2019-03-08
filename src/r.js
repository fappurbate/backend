
'use strict';

module.exports = ({ log }) => require('rethinkdbdash')({
  db: 'fappurbate',
  silent: true,
  log
});
