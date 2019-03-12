import RequestTarget from '@kothique/request-target';

// there will be no window.parent later
const parent = window.parent;

const eventHandlers = new EventTarget;
const requestHandlers = new RequestTarget({
  callAllHandlers: true
});

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
      reject({
        error: data.error,
        data: data.data
      });
    } else {
      resolve(data.data);
    }
  }
});

export default ({ id, name, version, broadcaster, pageName }) => ({
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
      return this;
    }
  },
  emitEvent: (receivers, subject, data) => {
    parent.postMessage({
      subject: 'event',
      data: {
        receivers,
        subject,
        data,
        sender: pageName
      }
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

    parent.postMessage({
      subject: 'request',
      data: { requestId, subject, data }
    }, '*');

    return promise;
  }
});
