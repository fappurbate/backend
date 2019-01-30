const ivm = require('isolated-vm');

module.exports.createAPI = function createAPI(data) {
  const { id, broadcaster } = data;

  const api = {
    runtime: { id, broadcaster },
    test: {
      say: new ivm.Reference(function (...args) {
        console.log(`VM(${id},${broadcaster}):`, ...args);
      })
    }
  };

  return new ivm.ExternalCopy(api);
};
