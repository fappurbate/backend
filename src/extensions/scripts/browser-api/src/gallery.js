import FappurbateError from './error';

const eventHandlers = new EventTarget;

// there will be no window.parent later
const parent = window.parent;

let nextRequestId = 0;
const requests = {};

window.addEventListener('message', event => {
  const { subject, data } = event.data;

  if (subject === 'gallery-select') {
    const { requestId, selection } = data;

    requests[requestId](selection);
  } else if (subject === 'gallery-add') {
    const { file } = data;

    eventHandlers.dispatchEvent(new CustomEvent('gallery-add', {
      detail: { file }
    }));
  } else if (subject === 'gallery-remove') {
    const { file } = data;

    eventHandlers.dispatchEvent(new CustomEvent('gallery-remove', {
      detail: { file }
    }));
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

    const promise = new Promise(resolve => {
      requests[requestId] = result => {
        delete requests[requestId];
        resolve(result);
      }
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
      })
    }
  },
  onRemove: {
    addListener: callback => {
      eventHandlers.addEventListener('gallery-remove', event => {
        const { file } = event.detail;
        callback(file);
      })
    }
  }
});
