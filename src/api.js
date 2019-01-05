const db = require('./db');

module.exports = router => {
  router.post('/api/tips', async ctx => {
    const { tipper, amount } = ctx.request.body;

    console.debug(`Received tip: ${amount}tkn from ${tipper}`);

    if (await db.tippers.findOne({ username: tipper })) {
      await db.tippers.update({ username: tipper }, { $inc: { amount } });
    } else {
      await db.tippers.insert({
        username: tipper,
        amount
      });
    }

    ctx.status = 200;
  });
};
