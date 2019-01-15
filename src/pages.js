const db = require('./db');
const config = require('./config');

module.exports = router => {
  router.get('/', async ctx => {
    return ctx.render('index.swig');
  });

  router.get('/broadcasters', async ctx => {
    const broadcasters = await db.broadcasters.find().sort({ username: 1 });
    return ctx.render('broadcasters.swig', { broadcasters });
  });

  router.get('/translations', async ctx => {
    const requests = await db.translationRequests.find().sort({ createdAt: -1 });
    return ctx.render('translations.swig', {
      requests,
      wsPort: config.wsAppPort
    });
  });

  router.get('/:broadcaster', async ctx => {
    const { broadcaster } = ctx.params;

    return ctx.render('profile.swig', { broadcaster });
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

  router.get('/:broadcaster/animation', async ctx => {
    const { broadcaster } = ctx.params;

    return ctx.render('animation.swig', {
      broadcaster,
      wsPort: config.wsAppPort
    });
  });
};
