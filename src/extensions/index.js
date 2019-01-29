const fs = require('fs-extra');
const path = require('path');
const { NodeVM, VMScript } = require('vm2');

const db = require('../db');
const { CustomError } = require('../common/errors');
const config = require('../config');
const wssApp = require('../wss-app');

const { install } = require('./install');
const { remove } = require('./remove');
const { createAPI } = require('./api');

const allVMs = {};

function getBroadcasterVMs(broadcaster) {
  return allVMs[broadcaster] || (allVMs[broadcaster] = {});
}

async function start(arg, broadcaster) {
  const extension = typeof arg === 'object' ? arg : await db.extensions.findOne({ _id: arg });
  if (!extension) {
    throw new CustomError(`Couldn't find extension ${arg}.`, {}, 'ERR_EXTENSION_NOT_FOUND');
  }

  console.log(`Starting extension ${extension.name} (${extension._id})...`);

  const extensionPath = path.join(config.extensionsPath, extension._id);

  const vms = getBroadcasterVMs(broadcaster);
  console.log(broadcaster, vms); // TODO: remove

  const vmInfo = vms[extension._id] = {
    id: extension._id,
    vm: new NodeVM({
      console: 'redirect',
      sandbox: {
        kck: createAPI({ id: extension._id, broadcaster })
      },
      require: {
        root: extensionPath,
        context: 'sandbox'
      }
    })
  };

  const backgroundSource = await Promise.all(
    extension.background.scripts.map(filename => path.join(extensionPath, filename))
      .map(filepath => fs.readFile(filepath, { encoding: 'utf8' }))
  ).then(scripts => scripts.join('\n\n'));

  const backgroundScript = new VMScript(backgroundSource);

  console.log(`Running background script for extension ${extension.name} (${extension._id})...`);
  try {
    vmInfo.vm.run(backgroundScript);
  } catch (error) {
    console.log(`Extension ${extension.name} (${extension._id}):`);
    console.log(error);
  }

  wssApp.onExtensionStart(extension);
}

async function stop(arg, broadcaster) {
  const extension = typeof arg === 'object' ? arg : await db.extensions.findOne({ _id: arg });
  if (!extension) {
    throw new CustomError(`Couldn't find extension ${arg}.`, {}, 'ERR_EXTENSION_NOT_FOUND');
  }

  const vms = getBroadcasterVMs(broadcaster);

  const vmInfo = vms[extension._id];
  if (!vmInfo) {
    throw new CustomError(`Couldn't stop extension which is not running.`)
  }

  console.log(`Shutting down extension ${extension.name} (${extension._id})...`);
  delete vms[extension._id];
  // TODO: stop the VM
  // cannot do this for now, gotta use isolated-vm

  wssApp.onExtensionStop(extension);
}

async function queryForBroadcaster(broadcaster) {
  const vms = getBroadcasterVMs(broadcaster);

  const extensions = await db.extensions.find().sort({ createdAt: -1 });
  extensions.forEach(extension => {
    extension.running = extension._id in vms;
  });

  return extensions;
}

module.exports = {
  install,
  start,
  stop,
  remove,
  queryForBroadcaster
};
