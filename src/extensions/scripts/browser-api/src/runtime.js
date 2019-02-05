import RequestTarget from '@kothique/request-target';
import { CustomError } from './errors';

const idNode = document.querySelector('meta[data-name="id"]');
const nameNode = document.querySelector('meta[data-name="name"]');
const versionNode = document.querySelector('meta[data-name="version"]');
const broadcasterNode = document.querySelector('meta[data-name="broadcaster"]');

const id = idNode.getAttribute('data-content');
const name = nameNode.getAttribute('data-content');
const version = versionNode ? versionNode.getAttribute('data-content') : null;
const broadcaster = broadcasterNode.getAttribute('data-content');

idNode.remove();
nameNode.remove();
versionNode &&  versionNode.remove();
broadcasterNode.remove();

const eventHandlers = new EventTarget;
const requestHandlers = new RequestTarget;

let nextRequestId = 0;
const requests = {};

window.addEventListener('message', event => {
  const { subject, data } = event.data;

  if (subject === 'event') {
    eventHandlers.dispatchEvent(new CustomEvent(data.subject, {
      detail: {
        sender: data.sender,
        data: data.data
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

export default {
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
};
