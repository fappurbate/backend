const fs = require('fs-extra');
const path = require('path');
const tar = require('tar-fs');
const tmp = require('tmp');
const Ajv = require('ajv');
const { NodeVM, VMScript } = require('vm2');

const db = require('./db');
const config = require('./config');
const wssApp = require('./wss-app');

const ajv = new Ajv;

const validateManifest = ajv.compile({
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'http://example.com/product.schema.json',
  title: 'Manifest',
  description: 'KCK Extension Manifest File',
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    background: {
      type: 'object',
      additionalProperties: false,
      properties: {
        scripts: {
          type: 'array',
          items: { type: 'string' }
        }
      },
      required: ['scripts']
    },
    front: {
      type: 'object',
      additionalProperties: false,
      properties: {
        page: { type: 'string' },
        scripts: {
          type: 'array',
          items: { type: 'string' }
        }
      },
      required: ['page']
    },
    settings: {
      type: 'object',
      additionalProperties: false,
      properties: {
        page: { type: 'string' },
        scripts: {
          type: 'array',
          items: { type: 'string' }
        }
      },
      required: ['page']
    },
    stream: {
      type: 'object',
      additionalProperties: false,
      properties: {
        page: { type: 'string' },
        scripts: {
          type: 'array',
          items: { type: 'string' }
        }
      },
      required: ['page']
    },
  },
  required: ['name', 'description']
});

const { CustomError } = require('./common/errors');

async function installExtension(packageStream) {
  const extensionPath = await extractPackage(packageStream);

  const manifestRaw = await loadFile(
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

  await Promise.all((manifest.background.scripts || []).map((script, index) => tryLoadFile(
    extensionPath,
    `background script ${index}`,
    script,
    'ERR_LOAD_BACKGROUND_SCRIPT'
  )));

  manifest.front && await tryLoadFile(
    extensionPath,
    'front page',
    manifest.front && manifest.front.page,
    'ERR_LOAD_FRONT_PAGE'
  );

  manifest.front && manifest.front.scripts &&
    await Promise.all(manifest.front.scripts.map((script, index) => tryLoadFile(
      extensionPath,
      `front script ${index}`,
      script,
      'ERR_LOAD_FRONT_SCRIPT'
    )));

  manifest.settings && await tryLoadFile(
    extensionPath,
    'settings page',
    manifest.settings && manifest.settings.page,
    'ERR_LOAD_SETTINGS_PAGE'
  );

  manifest.settings && manifest.settings.scripts &&
    await Promise.all(manifest.settings.scripts.map((script, index) => tryLoadFile(
      extensionPath,
      `settings script ${index}`,
      script,
      'ERR_LOAD_SETTINGS_SCRIPT'
    )));

  manifest.stream && await loadFile(
      extensionPath,
      'stream page',
      manifest.stream && manifest.stream.page,
      'ERR_LOAD_STREAM_PAGE'
    );

  manifest.stream && manifest.stream.scripts &&
    await Promise.all(manifest.stream.scripts.map((script, index) => tryLoadFile(
      extensionPath,
      `stream script ${index}`,
      script,
      'ERR_LOAD_STREAM_SCRIPT'
    )));


  const extension = await db.extensions.insert({
    ...manifest,
    running: false,
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

  await startExtension(extension);

  return extension._id;
}

function loadFile(extensionPath, name, filepath, errorcode) {
  if (!filepath) { return null; }

  try {
    return fs.readFile(path.join(extensionPath, filepath), { encoding: 'utf8' });
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error(`Couldn't load extension (${extensionPath}): no ${name}`);
    } else {
      console.error(`Couldn't load extension (${extensionPath}):`, error.message);
    }

    throw new CustomError(`Failed to load ${name}.`, { error }, errorcode);
  }
}

async function tryLoadFile(extensionPath, name, filepath, errorcode) {
  if (!filepath) { return; }

  try {
    await fs.readFile(path.join(extensionPath, filepath), { encoding: 'utf8' });
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error(`Couldn't load extension (${extensionPath}): no ${name}`);
    } else {
      console.error(`Couldn't load extension (${extensionPath}):`, error.message);
    }

    throw new CustomError(`Failed to load ${name}.`, { error }, errorcode);
  }
}

async function extractPackage(packageStream) {
  const tmpDir = tmp.dirSync();
  const writer = tar.extract(tmpDir.name);
  packageStream.pipe(writer);
  await new Promise(resolve => writer.once('finish', resolve));

  return tmpDir.name;
}

async function removeExtension(arg) {
  const extension = typeof arg === 'object' ? arg : await db.extensions.findOne({ _id: arg });
  if (!extension) {
    throw new CustomError(`Couldn't find extension ${extension.name} (${extension.id}).`, {}, 'ERR_EXTENSION_NOT_FOUND');
  }

  if (extension.running) {
    await stopExtension(extension);
  }

  const numRemoved = await db.extensions.remove({ _id: extension._id });
  if (numRemoved === 0) {
    throw new CustomError(`Couldn't find extension ${extension.name} (${extension.id}).`, {}, 'ERR_EXTENSION_NOT_FOUND');
  }

  await fs.remove(path.join(config.extensionsPath, extension._id));
}

const vmInfo = {};

async function startExtension(arg) {
  const extension = typeof arg === 'object' ? arg : await db.extensions.findOne({ _id: arg });
  if (!extension) { return; }

  console.log(`Starting extension ${extension.name} (${extension._id}))...`);

  const extensionPath = path.join(config.extensionsPath, extension._id);

  const info = vmInfo[extension._id] = {
    id: extension._id,
    vm: new NodeVM({
      console: 'redirect',
      sandbox: {
        testAPI: text => console.log('From sandbox: ', text)
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

  console.log(`Running background script for extension ${extension._id}...`);

  try {
    info.vm.run(backgroundScript);
  } catch (error) {
    console.log(`Extension ${extension.name} (${extension._id}):`);
    console.log(error);
  }

  await db.extensions.update({ _id: extension._id }, { $set: { running: true } });
  wssApp.onExtensionStart(extension);
}

async function stopExtension(arg) {
  const extension = typeof arg === 'object' ? arg : await db.extensions.findOne({ _id: arg });
  if (!extension) { return; }

  const info = vmInfo[extension._id];
  if (!info) {
    console.warn(`Attempting to stop extension which is not running.`);
    return;
  }

  await db.extensions.update({ _id: extension._id }, { $set: { running: false } });
  wssApp.onExtensionStop(extension);
}

// Start extensions

(async () => {
  const extensions = await db.extensions.find();
  extensions.forEach(extension => startExtension(extension));
})();

module.exports = {
  install: installExtension,
  remove: removeExtension
};
