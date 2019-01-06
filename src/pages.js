const db = require('./db');

module.exports = router => {
  router.get('/', async ctx => {
    const broadcasters = await db.broadcasters.find().sort({ username: 1 });
    return ctx.render('index.swig', { broadcasters });
  });

  router.get('/:broadcaster', async ctx => {
    const { broadcaster } = ctx.params;

    return ctx.render('broadcaster.swig', { broadcaster });
  });

  router.get('/:broadcaster/tippers', async ctx => {
    const { broadcaster } = ctx.params;

    const tippers = await db.tippers(broadcaster).then(store => store.find().sort({ amount: -1 }));
    return ctx.render('tippers.swig', { broadcaster, tippers });
  });

  router.get('/:broadcaster/tippers/clear', async ctx => {
    const { broadcaster } = ctx.params;

    await db.tippers(broadcaster).then(store => store.remove({}, { multi: true }));
    ctx.redirect(`/${broadcaster}/tippers`);
  });
};
