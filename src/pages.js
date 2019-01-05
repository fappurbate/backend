const db = require('./db');

module.exports = router => {
  router.get('/', async ctx => ctx.render('index.swig'));

  router.get('/tippers', async ctx => {
    const tippers = await db.tippers.find().sort({ amount: -1 });

    return ctx.render('tippers.swig', { tippers });
  });
};
