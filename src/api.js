const db = require('./db');

module.exports = router => {
  router.post('/api/tips', async ctx => {
    const { broadcaster, tipper, amount } = ctx.request.body;

    if (!broadcaster) {
      console.debug(`Broadcaster username expected.`);
      ctx.throw(400, 'Broadcaster username expected.');
    }

    console.debug(`Tip: ${amount}tkn from ${tipper} to ${broadcaster}`);

    const dbTippers = await db.tippers(broadcaster);

    if (await dbTippers.findOne({ username: tipper })) {
      await dbTippers.update({ username: tipper }, { $inc: { amount } });
    } else {
      await dbTippers.insert({
        username: tipper,
        amount
      });
    }

    ctx.status = 200;
  });
};
