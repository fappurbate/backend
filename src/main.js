const Koa = require('koa');
const mount = require('koa-mount');
const https = require('https');
const path = require('path');
const fs = require('fs-extra');

const config = require('./common/config');

require('./broadcast');
require('./extract-account-activity');

const app = new Koa;

const router = require('koa-router')();
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

https.createServer(
  {
    key: fs.readFileSync(config.ssl.key),
    cert: fs.readFileSync(config.ssl.cert)
  },
  app.callback()
).listen(config.port, () => {
  console.log(`HTTPS Server: listening on port ${config.port}...`);
});
