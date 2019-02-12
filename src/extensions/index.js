const fs = require('fs-extra');
const path = require('path');

const db = require('../common/db');
const { CustomError } = require('../common/errors');
const { createVMLogger } = require('../common/logger');
const config = require('../common/config');
const wssApp = require('../common/wss-app');
const { loadExtensionFile, tryLoadExtensionFile, extractPackage } = require('./util');
const { readManifest } = require('./manifest');
const { VM } = require('./vm');

const vmsByBroadcaster = {};

function getBroadcasterVMs(broadcaster) {
  return vmsByBroadcaster[broadcaster] || (vmsByBroadcaster[broadcaster] = {});
}

async function install(packageStream) {
  const extensionPath = await extractPackage(packageStream);

  const manifest = await readManifest(extensionPath);

  await tryLoadExtensionFile(
    extensionPath,
    'main script',
    manifest.mainScript,
    'ERR_LOAD_BACKGROUND_SCRIPT'
  );

  for (const name in manifest.pages || {}) {
    const { template, scripts = [] } = manifest.pages[name];

    await tryLoadExtensionFile(
      extensionPath,
      `${name} page`,
      template,
      `ERR_LOAD_PAGE`
    );

    await Promise.all(scripts.map((script, index) => tryLoadExtensionFile(
      extensionPath,
      `${name} script ${index}`,
      script,
      `ERR_LOAD_SCRIPT`
    )));
  }

  const extension = await db.extensions.insert({
    ...manifest,
    createdAt: new Date()
  });

  const newExtensionPath = path.join(config.extensionsPath, extension._id);
  try {
    await fs.move(extensionPath, newExtensionPath);
  } catch (error) {
    await db.extensions.delete({ _id: extension._id });
    throw new CustomError(`Failed to install extension ${extension._id}.`, { error }, 'ERR_INSTALL_EXTENSION');
    console.error(`Couldn't not move extension from ${extensionPath} to ${newExtensionPath}.`);
  }

  wssApp.broadcast('extension-install', { extension: { ...extension, running: false } });

  return extension._id;
}

async function remove(arg) {
  const extension = typeof arg === 'object' ? arg : await db.extensions.findOne({ _id: arg });
  if (!extension) {
    throw new CustomError(`Couldn't find extension ${arg}.`, {}, 'ERR_EXTENSION_NOT_FOUND');
  }

  for (const broadcaster in vmsByBroadcaster) {
    for (const id in getBroadcasterVMs(broadcaster)) {
      if (id === extension._id) {
        try {
          await stop(extension._id, broadcaster);
        } catch (error) {
          console.error(`Failed to stop extension ${extension.name} (${extension._id}) on remove.`, error);
        }
      }
    }
  }

  const numRemoved = await db.extensions.remove({ _id: extension._id });
  if (numRemoved === 0) {
    throw new CustomError(`Couldn't find extension ${extension.name} (${extension.id}).`, {}, 'ERR_EXTENSION_NOT_FOUND');
  }

  await fs.remove(path.join(config.extensionsPath, extension._id));

  wssApp.broadcast('extension-remove', { extension });
}

async function start(arg, broadcaster) {
  const extension = typeof arg === 'object' ? arg : await db.extensions.findOne({ _id: arg });
  if (!extension) {
    throw new CustomError(`Couldn't find extension ${arg}.`, {}, 'ERR_EXTENSION_NOT_FOUND');
  }

  const extensionPath = path.join(config.extensionsPath, extension._id);

  const vms = getBroadcasterVMs(broadcaster);

  const vm = new VM(extension, broadcaster);
  vm.on('error', async error => {
    console.debug(`VM encountered an error:`, error);
    await stop(extension, broadcaster);
  });

  console.log(`Starting extension ${extension.name} (${extension._id})...`);
  await vm.start();

  const vmInfo = vms[extension._id] = {
    id: extension._id,
    vm
  };

  wssApp.broadcast('extension-start', { extension, broadcaster });
}

async function stop(arg, broadcaster) {
  const extension = typeof arg === 'object' ? arg : await db.extensions.findOne({ _id: arg });
  if (!extension) {
    throw new CustomError(`Couldn't find extension ${arg}.`, {}, 'ERR_EXTENSION_NOT_FOUND');
  }

  const vms = getBroadcasterVMs(broadcaster);

  const vmInfo = vms[extension._id];
  if (!vmInfo) {
    throw new CustomError(`Couldn't stop extension which is not running.`, {}, 'ERR_EXTENSION_ALREADY_STOPPED');
  }

  console.log(`Shutting down extension ${extension.name} (${extension._id})...`);
  await vmInfo.vm.dispose();
  delete vms[extension._id];
  console.log(`Extension ${extension.name} (${extension._id}) is shut down.`);

  wssApp.broadcast('extension-stop', { extension, broadcaster });
}

async function getPage(arg, broadcaster, name) {
  const extension = typeof arg === 'object' ? arg : await db.extensions.findOne({ _id: arg });
  if (!extension) {
    throw new CustomError(`Couldn't find extension ${arg}.`, {}, 'ERR_EXTENSION_NOT_FOUND');
  }

  const vms = getBroadcasterVMs(broadcaster);
  const vmInfo = vms[extension._id];

  if (!vmInfo) {
    const notRunningPage = await fs.readFile(
      path.join(__dirname, 'pages', 'not-running.html'),
      { encoding: 'utf8' }
    );
    return notRunningPage;
  }

  return await vmInfo.vm.getPage(name);
}

async function getLogs(arg, broadcaster, options) {
  const rows = options.rows || null;

  const extension = typeof arg === 'object' ? arg : await db.extensions.findOne({ _id: arg });
  if (!extension) {
    throw new CustomError(`Couldn't find extension ${arg}.`, {}, 'ERR_EXTENSION_NOT_FOUND');
  }

  const vms = getBroadcasterVMs(broadcaster);
  const vmInfo = vms[extension._id];

  const logger = vmInfo ? vmInfo.vm.logger : createVMLogger({
    extensionId: extension._id,
    broadcaster
  });
  const { nedb: logs } = await new Promise((resolve, reject) =>
    logger.query(rows ? { rows } : {}, (err, logs) => err ? reject(err) : resolve(logs))
  );

  return logs;
}

async function queryForBroadcaster(broadcaster) {
  const extensions = await db.extensions.find().sort({ createdAt: -1 });

  const vms = getBroadcasterVMs(broadcaster);
  extensions.forEach(extension => {
    extension.running = extension._id in vms;
  });

  return extensions;
}

async function queryOneForBroadcaster(broadcaster, id) {

  const extension = await db.extensions.findOne({ _id: id });
  if (!extension) {
    throw new CustomError(`Couldn't find extension ${arg}.`, {}, 'ERR_EXTENSION_NOT_FOUND');
  }

  const vms = getBroadcasterVMs(broadcaster);
  extension.running = extension._id in vms;

  return extension;
}

async function getStreamExtensions(broadcaster) {
  const extensions = {};

  const vms = getBroadcasterVMs(broadcaster);
  for (const id in vms) {
    extensions[id] = vms[id].vm.extension;
  }

  return extensions;
}

module.exports = {
  install,
  start,
  stop,
  remove,
  getPage,
  getStreamInfo: async broadcaster => {
    const pages = {};

    await Promise.all(
      Object.entries(getBroadcasterVMs(broadcaster)).map(async ([id, { vm }]) => {
        const page = await getPage(id, broadcaster, 'stream');
        pages[id] = { page, extension: vm.extension }
      })
    );

    return pages;
  },
  getLogs,
  queryForBroadcaster,
  queryOneForBroadcaster,
  getStreamExtensions
};
