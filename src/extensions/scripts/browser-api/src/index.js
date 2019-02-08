import '@babel/polyfill';

import runtime from './runtime';
import cb from './chaturbate';

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

console.log(data);

Object.values(nodes).forEach(node => node && node.remove());

window.kck = {
  runtime: runtime(data),
  cb: cb(data)
};

const oldAddEventListener = window.addEventListener;
window.addEventListener = function addEventListener(type, ...rest) {
  if (type === 'message') {
    console.error(`Don't listen to 'message', better use KCK API ^_^ This is for security reasons.`);
    return;
  }

  return oldAddEventListener.apply(window, rest);
};

const oldOnMessage = window.onmessage;
Object.defineProperty(window, 'onmessage', {
  set: () => console.error(`Please don't set 'onmessage', KCK API is better (I hope)! If it's not, create an issue on GitHub ^-^`),
  get: () => oldOnMessage
});

const oldParent = window.parent;
Object.defineProperty(window, 'parent', {
  get: () => console.error(`There's no parent anymore.`)
});
