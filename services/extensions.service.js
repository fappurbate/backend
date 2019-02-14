'use strict';

const fs = require('fs-extra');
const path = require('path');
const { ObjectId } = require('bson');
const DbService = require('moleculer-db');
const MongoDBAdapter = require('moleculer-db-adapter-mongo');
const { MoleculerError, MoleculerClientError } = require('moleculer').Errors;
const RequestTarget = require('@kothique/request-target');
const EventEmitter = require('events');

const { createLogger } = require('./extensions/logger');
const { loadExtensionFile, tryLoadExtensionFile, extractPackage } = require('./extensions/util');
const { readManifest } = require('./extensions/manifest');
const { VM } = require('./extensions/vm');

const mongoUrl = process.env.MONGO_URL || 'mongodb://localhost:27017/fappurbate';

module.exports = {
	name: 'extensions',
  mixins: [DbService],
	adapter: new MongoDBAdapter(mongoUrl, { useNewUrlParser: true }),
	collection: 'extensions',
	settings: {
    fields: ['_id', 'name', 'version', 'description', 'mainScript', 'pages'],
    pageSize: 50,
    maxPageSize: 200,
    maxLimit: -1,

    path: 'extensions'
	},
  created() {
    this.vmsByBroadcaster = {};
		this.apiEventHandlers = new EventEmitter;
		this.apiRequestHandlers = new RequestTarget({
			byRequest: {
				message: { getAllResults: true }
			}
		});
  },
  methods: {
    getBroadcasterVMs(broadcaster) {
      return this.vmsByBroadcaster[broadcaster] || (this.vmsByBroadcaster[broadcaster] = {});
    }
  },
	events: {
		'chaturbate.accountActivity'(payload) {
			const { username, type, timestamp, data } = payload;
			this.apiEventHandlers.emit('account-activity', { username, type, timestamp, data });
		},
		'broadcast.start'(payload) {
			const { broadcaster } = payload;
			this.apiEventHandlers.emit('broadcast-start', { broadcaster });
		},
		'broadcast.stop'(payload) {
			const { broadcaster } = payload;
			this.apiEventHandlers.emit('broadcast-stop', { broadcaster });
		},
		'extract-account-activity.start'(payload) {
			const { username } = payload;
			this.apiEventHandlers.emit('extract-account-activity-start', { username });
		},
		'extract-account-activity.stop'(payload) {
			const { username } = payload;
			this.apiEventHandlers.emit('extract-account-activity-stop', { username });
		}
	},
  actions: {
		onEvent: {
			params: {
				id: 'string',
				broadcaster: 'string',
				receivers: { type: 'array', items: 'string' },
				sender: 'string',
				subject: 'string',
				data: 'any'
			},
			visibility: 'published',
			async handler(ctx) {
				const { id, broadcaster, receivers, sender, subject, data } = ctx.params;

				const index = receivers.indexOf('@main');
				const forMe = index !== -1;
				if (forMe) {
					data.receivers.splice(index, 1);
				}

				if (receivers.length > 0) {
					await ctx.call('gateway.app.broadcast', {
						subject: 'extension-event',
						data: { id, broadcaster, receivers, sender, subject, data }
					});
				}

				if (forMe) {
					this.apiEventHandlers.emit('event', {
						id, broadcaster, sender, subject, data
					});
				}
			}
		},
		onRequest: {
			params: {
				id: 'string',
				broadcaster: 'string',
				sender: 'string',
				subject: 'string',
				data: 'any'
			},
			visibility: 'published',
			async handler(ctx) {
				const { id, broadcaster, sender, subject, data } = ctx.params;

				return this.apiRequestHandlers.request('request', {
					id, broadcaster, sender, subject, data
				});
			}
		},
		handleMessage: {
			params: {
				info: 'object',
				type: 'string',
				timestamp: 'string',
				data: 'any'
			},
			visibility: 'published',
			async handler(ctx) {
				const { info, type, data } = ctx.params;
				const timestamp = new Date(ctx.params.timestamp);

        ctx.emit('broadcast.message', { info, type, timestamp, data });

				if (info.chat.active && info.broadcast.active) {
					const resultsByVM = await this.apiRequestHandlers.request('message', { info, type, timestamp, data });
					if (!resultsByVM) { return; }

					const options = {
						hidden: false
					};
					resultsByVM.forEach(resultsByExt =>
						resultsByExt.forEach((result = {}) => {
							if (result.hidden === true) {
								options.hidden = true;
							}
						})
					);

					return {
						...options.hidden && { hidden: true }
					};
				} else {
					return undefined;
				}
			}
		},
    install: {
      visibility: 'published',
      async handler(ctx) {
				const files = ctx.meta.files;

				if (!files || files.length !== 1) {
					throw new MoleculerClientError('Just one file is required.', 400, 'ERR_INVALID_ARGUMENTS');
				}

				const extensionPath = await extractPackage(files[0]);

        const manifest = await readManifest(extensionPath);

        await tryLoadExtensionFile(
          extensionPath,
          'main script',
          manifest.mainScript,
          'ERR_LOAD_BACKGROUND_SCRIPT'
        );

        for (const name in manifest.pages || {}) {
          const { template, scripts = [] } = manifest.pages[name];

          await tryLoadExtensionFile(
            extensionPath,
            `${name} page`,
            template,
            `ERR_LOAD_PAGE`
          );

          await Promise.all(scripts.map((script, index) => tryLoadExtensionFile(
            extensionPath,
            `${name} script ${index}`,
            script,
            `ERR_LOAD_SCRIPT`
          )));
        }

        const { ops: [extension] } = await this.adapter.collection.insertOne({
					...manifest,
          createdAt: new Date
        });

        const newExtensionPath = path.join(this.settings.path, extension._id.toString());
        try {
          await fs.move(extensionPath, newExtensionPath);
        } catch (error) {
          await db.extensions.delete({ _id: extension._id });
          throw new MoleculerError('Failed to install extension.', 500, 'ERR_INSTALL_EXTENSION', { error });
          this.logger.error(`Couldn't move extension from ${extensionPath} to ${newExtensionPath}.`);
        }

        await ctx.call('gateway.app.broadcast', {
          subject: 'extension-install',
          data: {
            extension: { ...extension, running: false }
          }
        });

        return extension._id.toString();
      }
    },
    uninstall: {
      params: {
        extensionId: 'string'
      },
      visibility: 'published',
      async handler(ctx) {
        const { extensionId } = ctx.params;

        const extension = await this.adapter.findById(extensionId);
        if (!extension) {
          throw new MoleculerError('Extension not found.', 404, 'ERR_EXTENSION_NOT_FOUND', { extensionId });
        }

        for (const broadcaster in this.vmsByBroadcaster) {
          for (const id in this.getBroadcasterVMs(broadcaster)) {
            if (extensionId === extension._id.toString()) {
              try {
                await ctx.call('extensions.stop', { extensionId, broadcaster });
              } catch (error) {
								this.logger.error('Failed to stop extension.', 500, 'ERR_STOP_EXTENSION', { extension });
              }
            }
          }
        }

				await this.adapter.collection.deleteOne({ _id: extension._id });

				await fs.remove(path.join(this.settings.path, extension._id.toString()));

				await ctx.call('gateway.app.broadcast', {
					subject: 'extension-remove',
					data: { extension }
				});
      }
    },
		start: {
			params: {
				extensionId: 'string',
				broadcaster: 'string'
			},
			visibility: 'published',
			async handler(ctx) {
				const { extensionId, broadcaster } = ctx.params;

				const extension = await this.adapter.findById(extensionId);
				if (!extension) {
					throw new MoleculerError('Extension not found.', 404, 'ERR_EXTENSION_NOT_FOUND', { extensionId });
				}

				const extensionPath = path.join(this.settings.path, extension._id.toString());

				const vms = this.getBroadcasterVMs(broadcaster);

				const vm = new VM({
					extension,
					broadcaster,
					extensionsPath: this.settings.path,
					callAction: this.broker.call.bind(this.broker),
					emitEvent: this.broker.emit.bind(this.broker),
					apiEventHandlers: this.apiEventHandlers,
					apiRequestHandlers: this.apiRequestHandlers
				});

				vm.on('error', async error => {
					this.logger.debug(`VM encountered an error:`, error);
					await ctx.call('extensions.stop', { extensionId, broadcaste });
				});

				this.logger.info(`Starting extension ${extension.name} (${extension._id.toString()})..`);
				await vm.start();

				const vmInfo = vms[extension._id.toString()] = {
					id: extension._id.toString(),
					vm
				};

				await ctx.call('gateway.app.broadcast', {
					subject: 'extension-start',
					data: { extension, broadcaster }
				});
			}
		},
		stop: {
			params: {
				extensionId: 'string',
				broadcaster: 'string'
			},
			visibility: 'published',
			async handler(ctx) {
				const { extensionId, broadcaster } = ctx.params;

				const extension = await this.adapter.findById(extensionId);
				if (!extension) {
					throw new MoleculerError('Extension not found.', 404, 'ERR_EXTENSION_NOT_FOUND', { extensionId });
				}

				const extensionPath = path.join(this.settings.path, extension._id.toString());

				const vms = this.getBroadcasterVMs(broadcaster);

				const vmInfo = vms[extension._id.toString()];
				if (!vmInfo) {
					throw new MoleculerClientError('Failed to stop an extension which is not running.', 400, 'ERR_EXTENSION_ALREADY_STOPPED', { extensionId, broadcaster });
				}

				this.logger.info(`Shutting down extension ${extension.name} (${extension._id.toString()})...`);
				await vmInfo.vm.dispose();
				delete vms[extension._id.toString()];
				this.logger.info(`Extension ${extension.name} (${extension._id.toString()}) is shut down.`);

				await ctx.call('gateway.app.broadcast', {
					subject: 'extension-stop',
					data: { extension, broadcaster }
				});
			}
		},
		forBroadcaster: {
			params: {
				broadcaster: 'string'
			},
			visibility: 'published',
			async handler(ctx) {
				const { broadcaster } = ctx.params;

				const extensions = await this.adapter.collection.find().sort({ createdAt: -1 }).toArray();

				const vms = this.getBroadcasterVMs(broadcaster);
				extensions.forEach(extension => {
					extension.running = extension._id.toString() in vms;
				});

				return extensions;
			}
		},
		oneForBroadcaster: {
			params: {
				extensionId: 'string',
				broadcaster: 'string'
			},
			visibility: 'published',
			async handler(ctx) {
				const { extensionId, broadcaster } = ctx.params;

				const extension = await this.adapter.findById(extensionId);
				if (!extension) {
					throw new MoleculerError('Extension not found.', 404, 'ERR_EXTENSION_NOT_FOUND', { extensionId });
				}

				const vms = this.getBroadcasterVMs(broadcaster);
				extension.running = extension._id.toString() in vms;

				return extension;
			}
		},
		getLogs: {
			params: {
				extensionId: 'string',
				broadcaster: 'string',
				rows: { type: 'string', optional: true }
			},
			visibility: 'published',
			async handler(ctx) {
				const { extensionId, broadcaster, rows } = ctx.params;

				const extension = await this.adapter.findById(extensionId);
				if (!extension) {
					throw new MoleculerError('Extension not found.', 404, 'ERR_EXTENSION_NOT_FOUND', { extensionId });
				}

				const vms = this.getBroadcasterVMs(broadcaster);
				const vmInfo = vms[extension._id.toString()];

				const logger = vmInfo ? vmInfo.vm.logger : createLogger({
					extensionId,
					broadcaster
				});
				const { nedb: logs } = await new Promise((resolve, reject) =>
					logger.query(rows ? { rows } : {}, (err, logs) => err ? reject(err) : resolve(logs))
				);

				return logs;
			}
		},
		getPage: {
			params: {
				extensionId: 'string',
				broadcaster: 'string',
				page: 'string'
			},
			visibility: 'published',
			async handler(ctx) {
				const { extensionId, broadcaster, page } = ctx.params;

				const extension = await this.adapter.findById(extensionId);
				if (!extension) {
					throw new MoleculerError('Extension not found.', 404, 'ERR_EXTENSION_NOT_FOUND', { extensionId });
				}

				const vms = this.getBroadcasterVMs(broadcaster);
				const vmInfo = vms[extension._id.toString()];

				if (!vmInfo) {
					const notRunningPage = await fs.readFile(
						path.join(__dirname, 'pages', 'not-running.html'),
						{ encoding: 'utf8' }
					);
					return notRunningPage;
				}

				return vmInfo.vm.getPage(page);
			}
		},
		getStreamInfo: {
			params: {
				broadcaster: 'string'
			},
			visibility: 'published',
			async handler(ctx) {
				const { broadcaster } = ctx.params;

				const pages = {};

				await Promise.all(
					Object.entries(this.getBroadcasterVMs(broadcaster)).map(async ([extensionId, { vm }]) => {
						const page = await ctx.call('extensions.getPage', {
							extensionId,
							broadcaster,
							page: 'stream'
						});
						pages[extensionId] = { page, extension: vm.extension };
					})
				);

				return pages;
			}
		},
		getStream: {
			params: {
				extensionId: 'string',
				broadcaster: 'string'
			},
			visibility: 'published',
			async handler(ctx) {
				const { extensionId, broadcaster } = ctx.params;

				const extension = await this.adapter.findById(extensionId);
				if (!extension) {
					throw new MoleculerError('Extension not found.', 404, 'ERR_EXTENSION_NOT_FOUND', { extensionId });
				}

				const page = await ctx.call('extensions.getPage', {
					extensionId,
					broadcaster,
					page: 'stream'
				});

				return { page, extension };
			}
		}
  }
};
