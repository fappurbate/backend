const db = require('./db');
const wssApp = require('./wss-app');
const wssExt = require('./wss-ext');

module.exports = router => {
  wssExt.messages.on('tip', async data => {
    const { broadcaster, tipper, amount } = data;

    console.debug(`Tip: ${amount}tkn from ${tipper} to ${broadcaster}`);

    // Send tip to the app
    wssApp.sendTip(broadcaster, tipper, amount);

    // Update the DB
    const dbTippers = await db.tippers(broadcaster);

    if (await dbTippers.findOne({ username: tipper })) {
      await dbTippers.update({ username: tipper }, { $inc: { amount } });
    } else {
      await dbTippers.insert({
        username: tipper,
        amount
      });
    }
  });

  wssExt.messages.on('translation-request', async data => {
    const { tabId, msgId, content } = data;

    console.debug(`Translation request: ${content}`);

    // Send request to the app
    wssApp.sendTranslationRequest(tabId, msgId, content);

    // Update the DB
    await db.translationRequests.insert({
      tabId,
      msgId,
      content,
      createdAt: new Date()
    });
  });

  wssApp.messages.on('translation', async data => {
    const { tabId, msgId, content } = data;

    console.debug(`Translation: ${content}`);
    console.log(tabId, msgId);

    // Send request to the extension
    wssExt.sendTranslation(tabId, msgId, content);

    // Update the DB
    await db.translationRequests.remove({ tabId, msgId });
  });
};
