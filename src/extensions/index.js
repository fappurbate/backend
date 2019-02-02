const fs = require('fs-extra');
const path = require('path');

const db = require('../common/db');
const { CustomError } = require('../common/errors');
const config = require('../common/config');
const wssApp = require('../wss-app');
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
    'background script',
    manifest.backgroundScript,
    'ERR_LOAD_BACKGROUND_SCRIPT'
  );

  for (const part of ['front', 'settings', 'stream']) {
    if (!manifest[part]) { break; }

    await tryLoadExtensionFile(
      extensionPath,
      `${part} page`,
      manifest[part].page,
      `ERR_LOAD_${part.toUpperCase()}_PAGE`
    );

    manifest[part].scripts && await Promise.all(manifest[part].scripts.map(
      (script, index) => tryLoadExtensionFile(
        extensionPath,
        `${part} script ${index}`,
        script,
        `ERR_LOAD_${part.toUpperCase()}_SCRIPT`
      )
    ));
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
    await db.extensions.delete({ _id: extension._id });
    throw new CustomError(`Failed to install extension ${extension._id}.`, { error }, 'ERR_INSTALL_EXTENSION');
  }

  wssApp.onExtensionInstall(extension);

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

  wssApp.onExtensionRemove(extension);
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

  wssApp.onExtensionStart(extension, broadcaster);
}

async function stop(arg, broadcaster) {
  const extension = typeof arg === 'object' ? arg : await db.extensions.findOne({ _id: arg });
  if (!extension) {
    throw new CustomError(`Couldn't find extension ${arg}.`, {}, 'ERR_EXTENSION_NOT_FOUND');
  }

  const vms = getBroadcasterVMs(broadcaster);

  const vmInfo = vms[extension._id];
  delete vms[extension._id];
  if (!vmInfo) {
    throw new CustomError(`Couldn't stop extension which is not running.`, {}, 'ERR_EXTENSION_ALREADY_STOPPED');
  }

  console.log(`Shutting down extension ${extension.name} (${extension._id})...`);
  vmInfo.vm.dispose();

  wssApp.onExtensionStop(extension, broadcaster);
}

async function getPage(arg, broadcaster, part) {
  const extension = typeof arg === 'object' ? arg : await db.extensions.findOne({ _id: arg });
  if (!extension) {
    throw new CustomError(`Couldn't find extension ${arg}.`, {}, 'ERR_EXTENSION_NOT_FOUND');
  }

  const vms = getBroadcasterVMs(broadcaster);
  const vmInfo = vms[extension._id];

  if (!vmInfo) {
    const notRunningPage = await fs.readFile(
      path.join(__dirname, 'pages', 'not-running.html')
    );
    return notRunningPage;
  }

  return await vmInfo.vm.getPage(part);
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
  getFrontPage: (extArg, broadcaster) => getPage(extArg, broadcaster, 'front'),
  getSettingsPage: (extArg, broadcaster) => getPage(extArg, broadcaster, 'settings'),
  getStreamPage: (extArg, broadcaster) => getPage(extArg, broadcaster, 'stream'),
  getStreamPages: broadcaster => Promise.all(
    Object.keys(getBroadcasterVMs(broadcaster)).map(id => getPage(id, broadcaster, 'stream'))
  ),
  queryForBroadcaster
};
