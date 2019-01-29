const fs = require('fs-extra');
const path = require('path');
const tar = require('tar-fs');
const tmp = require('tmp');

module.exports.loadExtensionFile =
function loadExtensionFile(extensionPath, name, filepath, errorcode) {
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

module.exports.tryLoadExtensionFile =
async function tryLoadExtensionFile(extensionPath, name, filepath, errorcode) {
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

module.exports.extractPackage =
async function extractPackage(packageStream) {
  const tmpDir = tmp.dirSync();
  const writer = tar.extract(tmpDir.name);
  packageStream.pipe(writer);
  await new Promise(resolve => writer.once('finish', resolve));

  return tmpDir.name;
}
