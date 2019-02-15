import '@babel/polyfill';

import runtime from './runtime';
import cb from './chaturbate';
import FappurbateError from './error';

const nodes = {
  id: document.querySelector('meta[data-name="id"]'),
  name: document.querySelector('meta[data-name="name"]'),
  version: document.querySelector('meta[data-name="version"]'),
  broadcaster: document.querySelector('meta[data-name="broadcaster"]'),
  initIsBroadcasting: document.querySelector('meta[data-name="init:is-broadcasting"]'),
  initIsExtractingAccountActivity: document.querySelector('meta[data-name="init:is-extracting-account-activity"]')
};

const data = {
  id: nodes.id.getAttribute('data-content'),
  name: nodes.name.getAttribute('data-content'),
  version: nodes.version ? nodes.version.getAttribute('data-content') : null,
  broadcaster: nodes.broadcaster.getAttribute('data-content'),
  init: {
    isBroadcasting: nodes.initIsBroadcasting.getAttribute('data-content'),
    isExtractingAccountActivity: nodes.initIsExtractingAccountActivity.getAttribute('data-content')
  }
};

Object.values(nodes).forEach(node => node && node.remove());

window.fb = {
  runtime: runtime(data),
  cb: cb(data),
  Error: FappurbateError
};

const oldAddEventListener = window.addEventListener;
window.addEventListener = function addEventListener(type, ...rest) {
  if (type === 'message') {
    throw new FappurbateError(`Don't listen to 'message', better use Fappurbate API ^_^.`);
  }

  return oldAddEventListener.apply(window, rest);
};

const oldOnMessage = window.onmessage;
Object.defineProperty(window, 'onmessage', {
  set: () => { throw new FappurbateError(`Please don't set 'onmessage', Fappurbate API is better (I hope)! If it's not, create an issue on GitHub ^-^`) },
  get: () => oldOnMessage
});

const oldParent = window.parent;
Object.defineProperty(window, 'parent', {
  get: () => { throw new FappurbateError(`There's no parent anymore.`) }
});
