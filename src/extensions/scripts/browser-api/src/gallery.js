import FappurbateError from './error';

const eventHandlers = new EventTarget;

// there will be no window.parent later
const parent = window.parent;

let nextRequestId = 0;
const requests = {};

window.addEventListener('message', event => {
  if (event.data.subject === 'gallery-select') {
    const { requestId, data } = event.data.data;

    requests[requestId].resolve(data);
  } else if (event.data.subject === 'gallery-add') {
    const { file } = event.data.data;

    eventHandlers.dispatchEvent(new CustomEvent('gallery-add', {
      detail: { file }
    }));
  } else if (event.data.subject === 'gallery-remove') {
    const { file } = event.data.data;

    eventHandlers.dispatchEvent(new CustomEvent('gallery-remove', {
      detail: { file }
    }));
  } else if (event.data.subject === 'response-thumbnail') {
    const { requestId, error, data } = event.data.data;

    if (error) {
      requests[requestId].reject(new FappurbateError(error, null, data));
    } else {
      requests[requestId].resolve(data);
    }
  } else if (event.data.subject === 'response-preview') {
    const { requestId, error, data } = event.data.data;

    if (error) {
      requests[requestId].reject(new FappurbateError(error, null, data));
    } else {
      requests[requestId].resolve(data);
    }
  } else if (event.data.subject === 'response-file') {
    const { requestId, error, data } = event.data.data;

    if (error) {
      requests[requestId].reject(new FappurbateError(error, null, data));
    } else {
      requests[requestId].resolve(data);
    }
  } else if (event.data.subject === 'response-metadata') {
    const { requestId, error, data } = event.data.data;

    if (error) {
      requests[requestId].reject(new FappurbateError(error, null, data));
    } else {
      requests[requestId].resolve(data);
    }
  }
});

export default () => ({
  /**
   * Prompt the user to select image(s) or audio.
   *
   * @param {object}           options
   * @param {'images'|'audio'} options.type
   * @param {boolean?}         options.multiple
   * @return {Promise} - Resolves to undefined, if the dialog was canceled. Otherwise,
   *    resolves to the file ID [array of IDs] of the selected file [files].
   * @throws {fb.Error}
   */
  select: options => {
    if (!options.type || !['images', 'audio'].includes(options.type)) {
      throw new FappurbateError('Invalid type.', 'ERR_INVALID_TYPE');
    }

    const { type } = options;
    const multiple = typeof options.multiple === 'boolean' ? options.multiple : false;

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
      subject: 'gallery-select',
      data: {
        requestId,
        type,
        multiple
      }
    }, '*');

    return promise;
  },
  onAdd: {
    addListener: callback => {
      eventHandlers.addEventListener('gallery-add', event => {
        const { file } = event.detail;
        callback(file);
      });
      return this;
    }
  },
  onRemove: {
    addListener: callback => {
      eventHandlers.addEventListener('gallery-remove', event => {
        const { file } = event.detail;
        callback(file);
      });
      return this;
    }
  },
  getThumbnail: (id, options = {}) => {
    // TODO: implement encoding
    const { size = 'small', encoding = 'base64' } = options;

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
      subject: 'request-thumbnail',
      data: { requestId, id, size }
    }, '*');

    return promise;
  },
  getPreview: (id, options = {}) => {
    // TODO: implement encoding
    const { encoding = 'base64' } = options;

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
      subject: 'request-preview',
      data: { requestId, id }
    }, '*');

    return promise;
  },
  getFile: (id, options = {}) => {
    // TODO: implement encoding
    const { encoding = 'base64' } = options;

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
      subject: 'request-file',
      data: { requestId, id }
    }, '*');

    return promise;
  },
  getMetadata: id => {
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
      subject: 'request-metadata',
      data: { requestId, id }
    }, '*');

    return promise;
  }
});
