const Koa = require('koa');
const mount = require('koa-mount');
const path = require('path');
const config = require('./config');

const app = new Koa;

const router = require('koa-router')();
require('./pages')(router);
require('./api')(router);

app.use(require('koa-logger')());
app.use(require('@koa/cors')());
app.use(mount('/assets', require('koa-static')(
  path.join(__dirname, '..', 'assets')
)));
app.use(require('koa-views')(
  path.join(__dirname, '..', 'views'), { map: { html: 'swig' } })
);
app.use(require('koa-body')());
app.use(router.routes());
app.use(router.allowedMethods());

app.listen(config.port, () => {
  console.log(`Listening on port ${config.port}...`);
});
