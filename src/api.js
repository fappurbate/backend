const asyncBusboy = require('async-busboy');

const db = require('./db');
const wssApp = require('./wss-app');
const wssExt = require('./wss-ext');
const { CustomError } = require('./common/errors');
const config = require('./config');
const extensions = require('./extensions');

module.exports = router => {
  router.get('/api/broadcasters', async ctx => {
    const broadcasters = await db.broadcasters.find().sort({ username: 1 });
    ctx.body = broadcasters;
  });

  router.get('/api/broadcaster/:broadcaster/tippers', async ctx => {
    const { broadcaster } = ctx.params;

    const tippers = await db.tippers(broadcaster).then(store => store.find().sort({ amount: -1 }));
    ctx.body = tippers;
  });

  router.get('/api/broadcaster/:broadcaster/translations', async ctx => {
    const { broadcaster } = ctx.params;

    const requests = await db.translationRequests.find({ broadcaster }).sort({ createdAt: -1 });
    ctx.body = requests;
  });

  router.get('/api/broadcaster/:broadcaster/extensions', async ctx => {
    const { broadcaster } = ctx.params;

    const result = await extensions.queryForBroadcaster(broadcaster);
    ctx.body = result;
  });

  router.post('/api/extensions', async ctx => {
    const { files } = await asyncBusboy(ctx.req);

    if (files.length !== 1) {
      return ctx.throw(500, 'Just one file is required.');
    }

    const packageStream = files[0];
    try {
      const id = await extensions.install(packageStream);
      ctx.body = { id };
    } catch (error) {
      console.error(`Failed to install extension.`, error);
      ctx.throw(400, error.message);
    }
  });

  router.delete('/api/extension/:id', async ctx => {
    const { id } = ctx.params;

    try {
      await extensions.remove(id);
      ctx.status = 200;
    } catch (error) {
      console.error(`Failed to remove extension.`, error);
      if (error.code === 'ERR_EXTENSION_NOT_FOUND') {
        ctx.throw(404, 'Extension not found.');
      } else {
        ctx.throw(500, error.message);
      }
    }
  });

  router.post('/api/broadcaster/:broadcaster/extension/:extension/start', async ctx => {
    const { extension: id, broadcaster } = ctx.params;

    try {
      await extensions.start(id, broadcaster);
      ctx.status = 200;
    } catch (error) {
      console.error(`Failed to start extension.`, error);
      if (error.code === 'ERR_EXTENSION_NOT_FOUND') {
        ctx.throw(404, 'Extension not found.');
      } else {
        ctx.throw(500, error.message);
      }
    }
  });

  router.post('/api/broadcaster/:broadcaster/extension/:extension/stop', async ctx => {
    const { extension: id, broadcaster } = ctx.params;

    try {
      await extensions.stop(id, broadcaster);
      ctx.status = 200;
    } catch (error) {
      console.error(`Failed to stop extension.`, error);
      if (error.code === 'ERR_EXTENSION_NOT_FOUND') {
        ctx.throw(404, 'Extension not found.');
      } else if (error.code === 'ERR_EXTENSION_ALREADY_STOPPED') {
        ctx.status = 200;
      } else {
        ctx.throw(500, error.message);
      }
    }
  });

  wssExt.events.on('tip', async data => {
    const { broadcaster, tipper, amount } = data;

    console.debug(`Tip: ${amount}tkn from ${tipper} to ${broadcaster}`);

    if (!broadcaster) {
      console.error(`Tip: no broadcaster specified! (tipper: ${tipper}, amount: ${amount})`);
      return;
    }

    // Send tip to the app
    wssApp.onTip(broadcaster, tipper, amount);

    // Update the DB
    await db.tippers(broadcaster).then(store =>
      store.update({ username: tipper }, { $inc: { amount } }, { upsert: true })
    );
  });

  wssExt.events.on('request-translation', async data => {
    const { broadcaster, tabId, msgId, content } = data;

    console.debug(`Translation request (${tabId}, ${msgId}): ${content}`);

    // Send request to the app
    wssApp.sendTranslationRequest(broadcaster, tabId, msgId, content);

    // Update the DB
    await db.translationRequests.insert({
      broadcaster,
      tabId,
      msgId,
      content,
      createdAt: new Date()
    });
  });

  wssExt.events.on('request-cancel-translation', async data => {
    const { tabId, msgId } = data;

    console.debug(`Cancel translation request (${tabId}, ${msgId}).`);

    // Send request to the app
    wssApp.sendCancelTranslationRequest(tabId, msgId);

    // Update the DB
    await db.translationRequests.remove({ tabId, msgId }, { multi: true });
  });

  wssExt.requests.on('tipper-info', async data => {
    const { broadcaster, tipper } = data;

    const tipperInfo = await db.tippers(broadcaster).then(store => store.findOne({ username: tipper }));
    if (!tipperInfo) {
      throw new CustomError('no tipper info found');
    } else {
      return tipperInfo;
    }
  });

  wssApp.events.on('translation', async data => {
    const { tabId, msgId, content } = data;

    console.debug(`Translation: ${content}`);

    // Send request to the extension
    wssExt.sendTranslation(tabId, msgId, content);

    // Update the DB
    await db.translationRequests.remove({ tabId, msgId }, { multi: true });
  });
};
