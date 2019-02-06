import RequestTarget from '@kothique/request-target';
import { CustomError } from '../../../../common/errors';

const eventHandlers = new EventTarget;
const requestHandlers = new RequestTarget;

let nextRequestId = 0;
const requests = {};

window.addEventListener('message', event => {
  const { subject, data } = event.data;

  if (subject === 'event') {
    const { subject, sender, data: eventData } = data;

    eventHandlers.dispatchEvent(new CustomEvent(subject, {
      detail: {
        sender,
        data: eventData
      }
    }));
  } else if (subject === 'response') {
    const { requestId } = data;
    const { resolve, reject } = requests[requestId];

    if (data.error) {
      reject(new CustomError(data.error, data.data));
    } else {
      resolve(data.data);
    }
  }
});

export default ({ id, name, version, broadcaster }) => ({
  id,
  name,
  version,
  broadcaster,
  onEvent: {
    addListener: (subject, callback) => {
      eventHandlers.addEventListener(subject, event => {
        const { sender, data } = event.detail;
        callback(sender, data);
      });
    }
  },
  emitEvent: (receivers, subject, data) => {
    window.parent.postMessage({
      subject: 'event',
      data: { receivers, subject, data }
    }, '*');
  },
  sendRequest: (subject, data) => {
    const requestId = nextRequestId++;

    const promise = new Promise((resolve, reject) => {
      requests[requestId] = {
        resolve: data => {
          resolve(data);
          delete requests[requestId];
        },
        reject: error => {
          reject(error);
          delete requests[requestId];
        }
      }
    });

    window.parent.postMessage({
      subject: 'request',
      data: { requestId, subject, data }
    }, '*');

    return promise;
  }
});
