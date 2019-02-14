const ivm = require('isolated-vm');
const fs = require('fs-extra');
const path = require('path');
const { EventEmitter } = require('events');
const { MoleculerError } = require('moleculer').Errors;

const { createLogger } = require('./logger');
const { createAPI, disposeAPI } = require('./api');
const { injectScriptsStart, injectScriptsEnd } = require('./util');

class VM extends EventEmitter {
  constructor(options) {
    super();

    const { extension, broadcaster, extensionsPath,
      callAction, emitEvent, apiEventHandlers, apiRequestHandlers } = options;

    this.extension = extension;
    this.broadcaster = broadcaster;
    this.callAction = callAction;
    this.emitEvent = emitEvent;
    this.apiEventHandlers = apiEventHandlers;
    this.apiRequestHandlers = apiRequestHandlers;

    this.logger = createLogger({
      extensionId: extension._id,
      extensionsPath,
      broadcaster,
      async onLogged(info) {
        await callAction('gateway.app.broadcast', {
          subject: 'extension-log',
          data: { extension, broadcaster, info }
        });
      }
    });

    this.clean = true;
    this.path = path.join(extensionsPath, this.extension._id);
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
      logger: this.logger,
      logError: this.logError.bind(this),
      callAction: this.callAction,
      emitEvent: this.emitEvent,
      events: this.apiEventHandlers,
      requests: this.apiRequestHandlers
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

    try {
      await mainModule.evaluate();
    } catch (error) {
      this.emit('error', error);
      this.logError(error);
    }

    this.apiEventHandlers.emit('start');
  }

  logError(error) {
    const { internal, stack } = this._getLocalStack(error.stack)

    if (internal) {
      console.error(stack);
      this.logger.log('error', 'Internal Framework Error');
    } else {
      this.logger.log('error', stack);
    }
  }

  _getLocalStack(globalStack) {
    const index = globalStack.indexOf('\n    at (<isolated-vm boundary>)');
    const internal = index === -1;

    if (internal) {
      return { internal, stack: globalStack };
    };

    console.log()

    globalStack = globalStack.substr(0, index);
    globalStack = globalStack.replace(/\n    at/g, '\nat');

    const localStack = globalStack.replace(
      new RegExp(`(\n.*?)extensions/${this.extension._id}(/.*)(\n|$)`),
      (match, p1, p2, p3) => p1 + p2 + p3
    );

    return { internal, stack: localStack };
  }

  async dispose() {
    if (this.clean) { return; }

    await this.apiRequestHandlers.request('stop');

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
          throw new MoleculerError('Module not found.', 404, 'ERR_MODULE_NOT_FOUND', { path: filepath });
        } else {
          throw new MoleculerError('Failed to load module.', 500, 'ERR_LOAD_MODULE_FAIL', { error });
        }
      });

    const module = await this.isolate.compileModule(content, {
      filename: filepath
    });
    await module.instantiate(this.context, async (specifier, referrer) => {
      if (!specifier.startsWith('.')) {
        throw new MoleculerError('Module not found.', 404, 'ERR_MODULE_NOT_FOUND', { path: specifier });
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
