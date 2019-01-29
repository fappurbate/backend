module.exports.createAPI = function createAPI(data) {
  const { id, broadcaster } = data;

  const api = {
    runtime: { id, broadcaster },
    test: {
      say(text) {
        console.log(`extension ${id} running by ${broadcaster} says ${text}`);
      }
    }
  };

  return api;
};
