const fs = require('fs-extra');
const path = require('path');
const { NodeVM, VMScript } = require('vm2');

const db = require('../db');
const { CustomError } = require('../common/errors');
const wssApp = require('../wss-app');
const config = require('../config');
const { createAPI } = require('./api');
const { loadExtensionFile, tryLoadExtensionFile, extractPackage } = require('./util');
const { validateManifest } = require('./validate-manifest');

const vmsByBroadcaster = {};

function getBroadcasterVMs(broadcaster) {
  return vmsByBroadcaster[broadcaster] || (vmsByBroadcaster[broadcaster] = {});
}

async function install(packageStream) {
  const extensionPath = await extractPackage(packageStream);

  const manifestRaw = await loadExtensionFile(
    extensionPath,
    'manifest.json',
    './manifest.json',
    'ERR_LOAD_MANIFEST'
  );

  const manifest = (() => {
    try {
      return JSON.parse(manifestRaw);
    } catch (error) {
      console.error(`Couldn't parse manifest.json (${path}):`, error.message);
      throw new CustomError('Failed to parse manifest.json.', { error }, 'ERR_PARSE_MANIFEST');
    }
  })();

  const valid = validateManifest(manifest);
  if (!valid) {
    console.error(`Invalid manifest.json:`, validateManifest.errors);
    throw new CustomError('Invalid manifest.json.', { errors }, 'ERR_INVALID_MANIFEST');
  }

  await Promise.all((manifest.background.scripts || []).map((script, index) => tryLoadExtensionFile(
    extensionPath,
    `background script ${index}`,
    script,
    'ERR_LOAD_BACKGROUND_SCRIPT'
  )));

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
    console.error(`Couldn't not move extension from ${extensionPath} to ${newExtensionPath}.`);
    await db.extensions.delete({ _id: extension._id });
    throw new CustomError(`Failed to install extension ${extension._id}.`, { error }, 'ERR_INSTALL_EXTENSION');
  }

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
}


async function start(arg, broadcaster) {
  const extension = typeof arg === 'object' ? arg : await db.extensions.findOne({ _id: arg });
  if (!extension) {
    throw new CustomError(`Couldn't find extension ${arg}.`, {}, 'ERR_EXTENSION_NOT_FOUND');
  }

  console.log(`Starting extension ${extension.name} (${extension._id})...`);

  const extensionPath = path.join(config.extensionsPath, extension._id);

  const vms = getBroadcasterVMs(broadcaster);

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
