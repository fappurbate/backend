const ivm = require('isolated-vm');
const fs = require('fs-extra');
const path = require('path');
const { EventEmitter } = require('events');

const { CustomError } = require('../common/errors');
const config = require('../config');

class VM extends EventEmitter {
  constructor(extension) {
    super();

    this.clean = true;

    this.extension = extension;
    this.path = path.join(config.extensionsPath, this.extension._id);
  }

  async start() {
    if (!this.clean) {
      console.debug(`Cannot start VM: not in the clean state.`, this.extension);
    }
    this.clean = false;

    this.isolate = new ivm.Isolate({ memoryLimit: 128 });
    this.context = await this.isolate.createContext();

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
