import '@babel/polyfill';

import runtime from './runtime';
import cb from './chaturbate';

const nodes = {
  id: document.querySelector('meta[data-name="id"]'),
  name: document.querySelector('meta[data-name="name"]'),
  version: document.querySelector('meta[data-name="version"]'),
  broadcaster: document.querySelector('meta[data-name="broadcaster"]')
};

const data = {
  id: nodes.id.getAttribute('data-content'),
  name: nodes.name.getAttribute('data-content'),
  version: nodes.version ? nodes.version.getAttribute('data-content') : null,
  broadcaster: nodes.broadcaster.getAttribute('data-content')
};

Object.values(nodes).forEach(node => node && node.remove());

window.kck = {
  runtime: runtime(data),
  cb: cb(data)
};
