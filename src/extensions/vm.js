const ivm = require('isolated-vm');
const fs = require('fs-extra');
const path = require('path');
const { EventEmitter } = require('events');

const { CustomError } = require('../common/errors');
const { createVMLogger } = require('../common/logger');
const config = require('../common/config');
const wssApp = require('../wss-app');
const { createAPI, disposeAPI } = require('./api');
const { injectScriptsStart, injectScriptsEnd } = require('./util');

class VM extends EventEmitter {
  constructor(extension, broadcaster) {
    super();

    this.extension = extension;
    this.broadcaster = broadcaster;

    this.logger = createVMLogger({
      extensionId: extension._id,
      broadcaster,
      onLogged(info) {
        wssApp.emit('extension-log', { extension, broadcaster, info });
      }
    });

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

    const { api, meta: apiMeta } = createAPI({
      id: this.extension._id,
      name: this.extension.name,
      version: this.extension.version || null,
      broadcaster: this.broadcaster,
      logger: this.logger
    });
    this.apiMeta = apiMeta;

    const jail = this.context.global;
    await jail.set('global', jail.derefInto());
    await jail.set('_ivm', ivm);
    await jail.set('_api', api);

    const bootstrapFilename = './scripts/bootstrap-vm.js';
    const bootstrapPath = path.join(__dirname, bootstrapFilename);
    const bootstrapSource = await fs.readFile(bootstrapPath, { encoding: 'utf8' });
    const bootstrap = await this.isolate.compileScript(bootstrapSource, {
      filename: bootstrapFilename
    });
    await bootstrap.run(this.context);

    const mainModule = await this._loadModule(
      path.join(this.path, this.extension.mainScript)
    ).catch(error => {
      this.emit('error', error);
      return null;
    });

    if (mainModule) {
      mainModule.evaluate()
        .catch(error => {
          this.emit('error', error);
          this.logger.log('error', this._getLocalStack(error.stack));
        });
    }
  }

  _getLocalStack(globalStack) {
    const index = globalStack.indexOf('\n    at (<isolated-vm boundary>)');
    globalStack = globalStack.substr(0, index);
    globalStack = globalStack.replace(/\n    at/, '\nat');

    const localStack = globalStack.replace(
      new RegExp(`(\n.* )/.*?/extensions/9X65srYuR6mUERXV(/.*)(\n|$)`),
      (match, p1, p2, p3) => p1 + p2 + p3
    );

    return localStack;
  }

  dispose() {
    if (this.clean) { return; }

    this.context.release();
    this.isolate.dispose();

    disposeAPI(this.apiMeta);

    this.clean = true;
  }

  get isDisposed() {
    return this.isolate.isDisposed;
  }

  async getPage(name) {
    const pageInfo = (this.extension.pages || {})[name];
    if (!pageInfo) { return '<html></html>'; }

    const { template: templatePath, scripts: scriptsPaths = [] } = pageInfo;

    const browserAPIPath = path.join(__dirname, './scripts/browser-api/dist/browser-api.js');
    const browserAPI = await fs.readFile(browserAPIPath, { encoding: 'utf8' })
      .catch(error => {
        console.error(`Browser API must be transpiled before running a VM. Run \`npm run build\`.`);
        throw error;
      });

    const template = await fs.readFile(
      path.join(this.path, templatePath),
      { encoding: 'utf8' }
    );
    const scripts = await Promise.all(scriptsPaths.map(scriptPath =>
      fs.readFile(path.join(this.path, scriptPath), { encoding: 'utf8' })
    ));

    return await injectScriptsStart(
      await injectScriptsEnd(template, scripts),
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
