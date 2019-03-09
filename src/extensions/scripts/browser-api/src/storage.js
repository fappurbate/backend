// there will be no window.parent later
const parent = window.parent;

const eventHandlers = new EventTarget;

export default () => {
  let nextRequestId = 0;
  const requests = {};

  window.addEventListener('message', event => {
    if (event.data.subject === 'storage-change') {
      const { key, oldValue, newValue } = event.data.data;

      eventHandlers.dispatchEvent(new CustomEvent('change', {
        detail: { key, oldValue, newValue }
      }));
    } else if (event.data.subject === 'response-storage-get') {
      const { requestId, error, data } = event.data.data;

      if (error) {
        requests[requestId].reject(new FappurbateError(error, null, data));
      } else {
        requests[requestId].resolve(data);
      }
    } else if (event.data.subject === 'response-storage-get-all') {
      const { requestId, error, data } = event.data.data;

      if (error) {
        requests[requestId].reject(new FappurbateError(error, null, data));
      } else {
        requests[requestId].resolve(data);
      }
    }
  });

  return {
    get: arg1 => {
      const keys = Array.isArray(arg1) ? arg1 : [arg1];
      const requestId = nextRequestId++;

      const promise = new Promise((resolve, reject) => {
        requests[requestId] = {
          resolve: result => {
            delete requests[requestId];
            resolve(result);
          },
          reject: error => {
            delete requests[requestId];
            reject(error);
          }
        };
      });

      parent.postMessage({
        subject: 'request-storage-get',
        data: { requestId, keys }
      }, '*');

      return promise.then(result => Array.isArray(arg1) ? result : result[arg1]);
    },
    getAll: () => {
      const requestId = nextRequestId++;

      const promise = new Promise((resolve, reject) => requests[requestId] = {
        resolve: result => {
          delete requests[requestId];
          resolve(result);
        },
        reject: error => {
          delete requests[requestId];
          reject(error);
        }
      });

      parent.postMessage({
        subject: 'request-storage-get-all',
        data: { requestId }
      }, '*');

      return promise;
    },
    onChanged: {
      addListener: callback => {
        eventHandlers.addEventListener('change', event => {
          const { key, oldValue, newValue } = event.detail;
          callback(key, { oldValue, newValue });
        });
        return this;
      }
    }
  };
};
