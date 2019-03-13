const fs = require('fs-extra');
const path = require('path');
const tar = require('tar-fs');
const tmp = require('tmp');
const { MoleculerError } = require('moleculer').Errors;

module.exports.loadExtensionFile =
function loadExtensionFile(extensionPath, name, filepath, errortype) {
  if (!filepath) { return null; }

  try {
    return fs.readFile(path.join(extensionPath, filepath), { encoding: 'utf8' });
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error(`Couldn't load extension (${extensionPath}): no ${name}`);
    } else {
      console.error(`Couldn't load extension (${extensionPath}):`, error.message);
    }

    throw new MoleculerError('Failed to load extension file.', 500, errortype, { name, error });
  }
}

module.exports.tryLoadExtensionFile =
async function tryLoadExtensionFile(extensionPath, name, filepath, errortype) {
  if (!filepath) { return; }

  try {
    await fs.readFile(path.join(extensionPath, filepath), { encoding: 'utf8' });
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error(`Couldn't load extension (${extensionPath}): no ${name}`);
    } else {
      console.error(`Couldn't load extension (${extensionPath}):`, error.message);
    }

    throw new MoleculerError('Failed to load extension file.', 500, errortype, { name, error });
  }
}

module.exports.extractPackage =
async function extractPackage(packageStream) {
  const tmpDir = tmp.dirSync();
  const writer = tar.extract(tmpDir.name);

  const promise = new Promise((resolve, reject) => {
    writer.once('finish', resolve);
    writer.on('error', reject);
  });

  packageStream.pipe(writer);
  await promise;

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
