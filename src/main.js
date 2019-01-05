const Koa = require('koa');
const config = require('./config');

const app = new Koa;
const router = require('koa-router')();

app.use(require('koa-logger')());
app.use(require('./render')());
app.use(require('koa-body')());
app.use(router.routes());

require('./pages')(router);
require('./api')(router);

app.listen(config.port, () => {
  console.log(`Listening on port ${config.port}...`);
});
