const ivm = require('isolated-vm');
const fs = require('fs-extra');
const path = require('path');
const { EventEmitter } = require('events');

const { CustomError } = require('../common/errors');
const config = require('../common/config');
const { createAPI } = require('./api');
const { injectScriptsStart, injectScriptsEnd } = require('./util');

class VM extends EventEmitter {
  constructor(extension, broadcaster) {
    super();

    this.extension = extension;
    this.broadcaster = broadcaster;

    this.clean = true;
    this.path = path.join(config.extensionsPath, this.extension._id);
  }

  async start() {
    if (!this.clean) {
      console.debug(`Cannot start VM: not in the clean state.`, this.extension);
    }
    this.clean = false;

    this.isolate = new ivm.Isolate({ memoryLimit: 128 });
    this.context = await this.isolate.createContext();

    const jail = this.context.global;
    await jail.set('global', jail.derefInto());
    await jail.set('_ivm', ivm);
    await jail.set('_api', createAPI({
      id: this.extension._id,
      broadcaster: this.broadcaster
    }).copyInto());

    const bootstrapFilename = './scripts/bootstrap-vm.js';
    const bootstrapPath = path.join(__dirname, bootstrapFilename);
    const bootstrapSource = await fs.readFile(bootstrapPath, { encoding: 'utf8' });
    const bootstrap = await this.isolate.compileScript(bootstrapSource, {
      filename: bootstrapFilename
    });
    await bootstrap.run(this.context);

    const mainModule = await this._loadModule(
      path.join(this.path, this.extension.backgroundScript)
    ).catch(error => {
      this.emit('error', error);
      return null;
    });

    if (mainModule) {
      mainModule.evaluate()
        .catch(error => {
          this.emit('error', error);
        });
    }
  }

  dispose() {
    if (this.clean) { return; }

    this.context.release();
    this.isolate.dispose();
    this.clean = true;
  }

  get isDisposed() {
    return this.isolate.isDisposed;
  }

  async getPage(part) {
    if (!['front', 'settings', 'stream'].includes(part)) { return null; }
    if (!this.extension[part]) { return '<html></html>'; }

    const browserAPIPath = path.join(__dirname, './scripts/browser-api.js');
    const browserAPI = await fs.readFile(browserAPIPath, { encoding: 'utf8' });

    const page = await fs.readFile(
      path.join(this.path, this.extension[part].page),
      { encoding: 'utf8' }
    );
    const scripts = [browserAPI, ...await Promise.all(
      (this.extension[part].scripts || []).map(script =>
        fs.readFile(path.join(this.path, script), { encoding: 'utf8' })
      )
    )];

    return await injectScriptsStart(
      await injectScriptsEnd(page, scripts),
      [browserAPI]
    );
  }

  async _loadModule(filepath) {
    const content = await fs.readFile(filepath, { encoding: 'utf8' })
      .catch(error => {
        if (error.code === 'ENOENT') {
          throw new CustomError(`Module not found: ${filepath}`, {}, 'ERR_MODULE_NOT_FOUND');
        } else {
          throw new CustomError(`Failed to load module: ${filepath}.`, { error }, 'ERR_MODULE_LOAD');
        }
      });

    const module = await this.isolate.compileModule(content, {
      filename: filepath
    });
    await module.instantiate(this.context, async (specifier, referrer) => {
      if (!specifier.startsWith('.')) {
        throw new CustomError(`Module not found: ${specifier}`, {}, 'ERR_MODULE_NOT_FOUND');
      }

      const dirname = path.dirname(filepath);
      return this._loadModule(path.join(dirname, specifier));
    });

    return module;
  }
}

module.exports = {
  VM
};
