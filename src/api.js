const db = require('./db');
const wssApp = require('./wss-app');
const wssExt = require('./wss-ext');
const { CustomError } = require('./common/errors');

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

  wssExt.events.on('tip', async data => {
    const { broadcaster, tipper, amount } = data;

    console.debug(`Tip: ${amount}tkn from ${tipper} to ${broadcaster}`);

    // Send tip to the app
    wssApp.sendTip(broadcaster, tipper, amount);

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
