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
};
