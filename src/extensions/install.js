const fs = require('fs-extra');
const path = require('path');
const tar = require('tar-fs');
const tmp = require('tmp');

const db = require('../db');
const config = require('../config');

const { validateManifest } = require('./validate-manifest');

module.exports.install = async function install(packageStream) {
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
