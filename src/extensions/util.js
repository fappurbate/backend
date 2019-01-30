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

module.exports.injectScriptsStart =
async function injectScriptsStart(page, scripts) {
  const index = (() => {
    const bodyIndex = page.indexOf('<head>');
    if (bodyIndex !== -1) { return bodyIndex; }

    const htmlIndex = page.indexOf('<html>');
    return htmlIndex;
  })();

  const start = index !== -1 ? page.substr(0, index + 6) : '';
  const end = index !== -1 ? page.substr(index + 6) : page;

  const result = start + scripts.map(script => `<script>${script}</script>`).join('') + end;
  return result;
}

module.exports.injectScriptsEnd =
async function injectScriptsEnd(page, scripts) {
  const index = (() => {
    const bodyIndex = page.indexOf('</body>');
    if (bodyIndex !== -1) { return bodyIndex; }

    const htmlIndex = page.indexOf('</html>');
    return htmlIndex;
  })();

  const start = index !== -1 ? page.substr(0, index) : page;
  const end = index !== -1 ? page.substr(index) : '';

  const result = start + scripts.map(script => `<script>${script}</script>`).join('') + end;
  return result;
}
