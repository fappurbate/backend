const db = require('./db');

module.exports = router => {
  router.get('/', async ctx => ctx.render('index.swig'));

  router.get('/tippers', async ctx => {
    const tippers = await db.tippers.find().sort({ amount: -1 });

    return ctx.render('tippers.swig', { tippers });
  });

  router.get('/tippers/clear', async ctx => {
    await db.tippers.remove({}, { multi: true });
    ctx.redirect('/tippers');
  });
};
