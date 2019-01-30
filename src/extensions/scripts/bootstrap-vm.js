const ivm = _ivm;
delete _ivm;

const api = _api;
delete _api;

global.kck = {
  runtime: {
    id: api.runtime.id,
    broadcaster: api.runtime.broadcaster
  },
  test: {
    say: (...args) => api.test.say.applySync(undefined, args.map(arg => new ivm.ExternalCopy(arg).copyInto()))
  }
};
