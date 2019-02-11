const fs = require('fs-extra');
const asyncBusboy = require('async-busboy');

const db = require('./common/db');
const { CustomError } = require('./common/errors');
const config = require('./common/config');
const wssApp = require('./common/wss-app');
const wssExt = require('./common/wss-ext');
const Broadcast = require('./broadcast');
const ExtractAccountActivity = require('./extract-account-activity');
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

  // ------------

  router.get('/api/broadcaster/:broadcaster/extensions', async ctx => {
    const { broadcaster } = ctx.params;

    const result = await extensions.queryForBroadcaster(broadcaster);
    ctx.body = result;
  });

  router.get('/api/broadcaster/:broadcaster/extension/:extension', async ctx => {
    const { broadcaster, extension: id } = ctx.params;

    try {
      const result = await extensions.queryOneForBroadcaster(broadcaster, id);
      ctx.body = result;
    } catch (error) {
      if (error.code === 'ERR_EXTENSION_NOT_FOUND') {
        ctx.throw(404, 'Extension not found.');
      } else {
        throw error;
      }
    }
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
      } else {
        ctx.throw(500, error.message);
      }
    }
  });

  router.get('/api/broadcaster/:broadcaster/extension/:extension/logs', async ctx => {
    const { extension: id, broadcaster } = ctx.params;
    const { rows = null } = ctx.query;

    try {
      const logs = await extensions.getLogs(id, broadcaster, {
        ...rows && { rows }
      });
      ctx.body = logs;
    } catch (error) {
      console.error(`Failed to retrieve extension logs.`, error);
      if (error.code === 'ERR_EXTENSION_NOT_FOUND') {
        ctx.throw(404, 'Extension not found.');
      } else {
        ctx.throw(500, error.message);
      }
    }
  });

  router.get('/api/broadcaster/:broadcaster/extension/:extension/page/:page', async ctx => {
    const { broadcaster, extension: id, page: pageName } = ctx.params;

    const page = await extensions.getPage(id, broadcaster, pageName);
    ctx.body = page;
  });

  router.get('/api/broadcaster/:broadcaster/extensions/stream', async ctx => {
    const { broadcaster } = ctx.params;

    const info = await extensions.getStreamInfo(broadcaster);
    ctx.body = info;
  });

  router.get('/api/broadcaster/:broadcaster/extension/:extension/stream', async ctx => {
    const { broadcaster, extension: id } = ctx.params;

    const extension = await db.extensions.findOne({ id: _id })
      .catch(error => {
        console.error(`Failed to get extension from DB:`, error);
        throw new CustomError('extension not found');
      });
    const page = await extensions.getPage(id, broadcaster, 'stream');

    ctx.body = { page, extension };
  });

  // done
  wssExt.events.on('request-translation', async (extId, data) => {
    const { broadcaster, tabId, msgId, content } = data;

    console.debug(`Translation request (${tabId}, ${msgId}): ${content}`);

    // Send request to the app
    wssApp.broadcast('request-translation', { broadcaster, tabId, msgId, content });

    // Update the DB
    await db.translationRequests.insert({
      broadcaster,
      tabId,
      msgId,
      content,
      createdAt: new Date()
    });
  });

  // done
  wssExt.events.on('request-cancel-translation', async (extId, data) => {
    const { tabId, msgId } = data;

    console.debug(`Cancel translation request (${tabId}, ${msgId}).`);

    // Send request to the app
    wssApp.broadcast('request-cancel-translation', { tabId, msgId });

    // Update the DB
    await db.translationRequests.remove({ tabId, msgId }, { multi: true });
  });

  // done
  wssExt.requests.on('tipper-info', async (extId, data) => {
    const { broadcaster, tipper } = data;

    const tipperInfo = await db.tippers(broadcaster).then(store => store.findOne({ username: tipper }));
    if (!tipperInfo) {
      throw new CustomError('no tipper info found');
    } else {
      return tipperInfo;
    }
  });

  // done
  wssApp.events.on('translation', async (appId, data) => {
    const { tabId, msgId, content } = data;

    console.debug(`Translation: ${content}`);

    // Send request to the extension
    wssExt.broadcast('translation', { tabId, msgId, content });

    // Update the DB
    await db.translationRequests.remove({ tabId, msgId }, { multi: true });
  });

  // done
  wssExt.events.on('message', async (extId, data) => {
    wssApp.broadcast('message', data);

    const { info, type, timestamp, data: msgData } = data;

    if (type === 'tip') {
      const { username, amount } = msgData;

      if (!Broadcast.isBroadcasting(info.chat.owner)) { return; }

      console.debug(`Tip: ${amount}tkn from ${username} to ${info.chat.owner}`);

      // Update the DB
      await db.tippers(info.chat.owner).then(store =>
        store.update({ username }, { $inc: { amount } }, { upsert: true })
      );
    }
  });

  // done
  wssExt.events.on('account-activity', (extId, data) => {
    wssApp.broadcast('account-activity', data);
  });

  // done
  /* Sends back a number of active broadcasts.
   * In other words, if it's > 0, then isBroadcasting === true.
   */
  wssApp.requests.on('is-broadcasting', (extId, data) => {
    const { broadcaster } = data;
    return Broadcast.isBroadcasting(broadcaster);
  });

  // TODO
  /* Sends back a number of active extractions.
   */
  wssApp.requests.on('is-extracting-account-activity', (extId, data) => {
    const { username } = data;
    return ExtractAccountActivity.isExtracting(username);
  });

  // done
  wssApp.events.on('send-message', (appId, data) => {
    const { broadcaster, message } = data;
    Broadcast.sendMessage(broadcaster, message);
  });
};
