'use strict';

const fs = require('fs-extra');
const path = require('path');
const { ObjectId } = require('bson');
const DbService = require('moleculer-db');
const RService = require('@kothique/moleculer-rethinkdbdash');
const MongoDBAdapter = require('moleculer-db-adapter-mongo');
const { MoleculerError, MoleculerClientError } = require('moleculer').Errors;
const RequestTarget = require('@kothique/request-target');
const EventEmitter = require('events');
const msgpack = require('msgpack-lite');

const { createLogger } = require('../src/extensions/logger');
const { loadExtensionFile, tryLoadExtensionFile, extractPackage } = require('../src/extensions/util');
const { readManifest } = require('../src/extensions/manifest');
const { VM } = require('../src/extensions/vm');

const mongoUrl = process.env.MONGO_URL || 'mongodb://localhost:27017/fappurbate';

module.exports = {
	name: 'extensions',
  mixins: [DbService, RService],
	rOptions: {
		db: 'fappurbate'
	},
	rInitial: {
		fappurbate: {
			extensions_storage: true
		}
	},
	adapter: new MongoDBAdapter(mongoUrl, { useNewUrlParser: true }),
	collection: 'extensions',
	settings: {
    fields: ['_id', 'name', 'version', 'description', 'mainScript', 'pages'],
    pageSize: 50,
    maxPageSize: 200,
    maxLimit: -1,

    path: 'extensions'
	},
  async created() {
    this.vmsByBroadcaster = {};
		this.apiEventHandlers = new EventEmitter;
		this.apiRequestHandlers = new RequestTarget({
			byRequest: {
				message: { getAllResults: true }
			}
		});

		this.online = {};
		this.extracting = {};
  },
	async rOnReady() {
		const cursor = await this.r.table('extensions_storage').changes({
			includeTypes: true
		});
		cursor.each(async (err, change) => {
			if (err) {
				this.logger.warn(`Error while listening to changes in the 'extensions_storage' table.`);
				return;
			}

			if (change.type === 'add') {
				const data = {
					extensionId: change.new_val.id[0],
					broadcaster: change.new_val.id[1],
					key: change.new_val.id[2],
					oldValue: undefined,
					newValue: change.new_val.value
				};
				await this.broker.call('gateway.app.broadcast', { subject: 'extensions-storage-change', data });
				this.broker.emit('extensions-storage.change', data);
				this.apiEventHandlers.emit('extensions-storage-change', data);
			} else if (change.type === 'remove') {
				const data = {
					extensionId: change.old_val.id[0],
					broadcaster: change.old_val.id[1],
					key: change.old_val.id[2],
					oldValue: change.old_val.value,
					newValue: undefined
				};
				await this.broker.call('gateway.app.broadcast', { subject: 'extensions-storage-change', data });
				this.broker.emit('extensions-storage.change', data);
				this.apiEventHandlers.emit('extensions-storage-change', data);
			} else if (change.type === 'change') {
				const data = {
					extensionId: change.new_val.id[0],
					broadcaster: change.new_val.id[1],
					key: change.new_val.id[2],
					oldValue: change.old_val.value,
					newValue: change.new_val.value
				};
				await this.broker.call('gateway.app.broadcast', { subject: 'extensions-storage-change', data });
				this.broker.emit('extensions-storage.change', data);
				this.apiEventHandlers.emit('extensions-storage-change', data);
			}
		});
	},
  methods: {
    getBroadcasterVMs(broadcaster) {
      return this.vmsByBroadcaster[broadcaster] || (this.vmsByBroadcaster[broadcaster] = {});
    },
		isBroadcasting(broadcaster) {
			let count = 0;

			Object.values(this.online).forEach(obj =>
				Object.entries(obj).forEach(([b, c]) => {
					if (b === broadcaster) {
						count += c;
					}
				}));

			return count;
		},
		isExtractingAccountActivity(username) {
			let count = 0;

			Object.values(this.extracting).forEach(obj =>
				Object.entries(obj).forEach(([u, c]) => {
					if (u === username) {
						count += c;
					}
				}));

			return count;
		}
  },
	events: {
		'chaturbate.accountActivity'(payload) {
			const { username, type, timestamp, data } = payload;
			this.apiEventHandlers.emit('account-activity', { username, type, timestamp, data });
		},
		'socket.ext.connect'({ socket }) {
			this.online[socket.id] = {};
			this.extracting[socket.id] = {};
		},
		'socket.ext.disconnect'({ socket }) {
			delete this.online[socket.id];
			delete this.extracting[socket.id];
		},
		'broadcast.start'(payload) {
			const { broadcaster, socketId } = payload;

			if (broadcaster in this.online[socketId]) {
				this.online[socketId][broadcaster]++;
			} else {
				this.online[socketId][broadcaster] = 1;
			}

			this.apiEventHandlers.emit('broadcast-start', { broadcaster });
		},
		'broadcast.stop'(payload) {
			const { broadcaster, socketId } = payload;

			if (this.online[socketId][broadcaster] &&
					--this.online[socketId][broadcaster] === 0) {
				delete this.online[socketId][broadcaster];
			}

			this.apiEventHandlers.emit('broadcast-stop', { broadcaster });
		},
		'extract-account-activity.start'(payload) {
			const { username, socketId } = payload;

			if (username in this.extracting[socketId]) {
				this.extracting[socketId][username]++;
			} else {
				this.extracting[socketId][username] = 1;
			}

			this.apiEventHandlers.emit('extract-account-activity-start', { username });
		},
		'extract-account-activity.stop'(payload) {
			const { username, socketId } = payload;

			if (this.extracting[socketId][username] &&
					--this.extracting[socketId][username] === 0) {
				delete this.extracting[socketId][username];
			}

			this.apiEventHandlers.emit('extract-account-activity-stop', { username });
		},
		'gallery.add'(payload) {
			const { file } = payload;

			this.apiEventHandlers.emit('gallery-add', { file });
		},
		'gallery.remove'(payload) {
			const { file } = payload;

			this.apiEventHandlers.emit('gallery-remove', { file });
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
					this.apiEventHandlers.emit('event', { id, broadcaster, sender, subject, data });
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
			params: {
				file: 'stream'
			},
      visibility: 'published',
      async handler(ctx) {
				const { file } = ctx.params;

				const extensionPath = await extractPackage(file);

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
								await this.actions.stop({ extensionId, broadcaster });
              } catch (error) {
								this.logger.error('Failed to stop extension.', 500, 'ERR_STOP_EXTENSION', { extension });
              }
            }
          }
        }

				await this.actions.clearStorage({ extensionId });
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
					r: this.r,
					callAction: this.broker.call.bind(this.broker),
					emitEvent: this.broker.emit.bind(this.broker),
					apiEventHandlers: this.apiEventHandlers,
					apiRequestHandlers: this.apiRequestHandlers,
					isBroadcasting: broadcaster => this.isBroadcasting(broadcaster),
					isExtractingAccountActivity: username => this.isExtractingAccountActivity(username)
				});

				vm.on('error', async error => {
					this.logger.debug(`VM encountered an error:`, error);
					await this.actions.stop({
						extensionId,
						broadcaster
					});
				});

				this.logger.info(`Starting extension ${extension.name} (${extension._id.toString()})...`);
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

				const extensions = await ctx.call('extensions.list', {
					...ctx.params,
					sort: '-createdAt'
				});

				const vms = this.getBroadcasterVMs(broadcaster);
				extensions.rows.forEach(extension => {
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
					extensionsPath: this.settings.path,
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
						path.join(__dirname, '..', 'src', 'extensions', 'pages', 'not-running.html'),
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
						const page = await this.actions.getPage({
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

				const page = await this.actions.getPage({
					extensionId,
					broadcaster,
					page: 'stream'
				});

				return { page, extension };
			}
		},
		storageSet: {
			params: {
				extensionId: 'string',
				broadcaster: 'string',
				pairs: 'object'
			},
			visibility: 'public',
			async handler(ctx) {
				const { extensionId, broadcaster, pairs } = ctx.params;

				await Promise.all(
					Object.entries(pairs).map(([key, value]) =>
						this.r.table('extensions_storage').get([extensionId, broadcaster, key]).replace({
							id: [extensionId, broadcaster, key],
							value: msgpack.encode(value)
						})
					)
				);
			}
		},
		storageGet: {
			params: {
				extensionId: 'string',
				broadcaster: 'string',
				keys: { type: 'array', items: 'string' }
			},
			visibility: 'published',
			async handler(ctx) {
				const { extensionId, broadcaster, keys } = ctx.params;

				const result = await this.r.table('extensions_storage').getAll(
					...keys.map(key => [extensionId, broadcaster, key])
				)
				.map(doc => [doc('id')(2), doc('value')])
				.coerceTo('object');

				keys.forEach(key => result[key] = result[key] ? msgpack.decode(result[key]) : undefined);

				return result;
			}
		},
		storageRemove: {
			params: {
				extensionId: 'string',
				broadcaster: 'string',
				keys: { type: 'array', items: 'string' }
			},
			visibility: 'public',
			async handler(ctx) {
				const { extensionId, broadcaster, keys } = ctx.params;

				const { deleted } = await this.r.table('extensions_storage').getAll(
					...keys.map(key => [extensionId, broadcaster, key])
				).delete();
				return deleted;
			}
		},
		storageGetAll: {
			params: {
				extensionId: 'string',
				broadcaster: 'string'
			},
			visibility: 'published',
			async handler(ctx) {
				const { extensionId, broadcaster } = ctx.params;

				const result = await this.r.table('extensions_storage').between(
					[extensionId, broadcaster, this.r.minval],
					[extensionId, broadcaster, this.r.maxval]
				)
				.map(doc => [doc('id')(2), doc('value')])
				.coerceTo('object');

				Object.keys(result).forEach(key => result[key] = msgpack.decode(result[key]));

				return result;
			}
		},
		storageRemoveAll: {
			params: {
				extensionId: 'string',
				broadcaster: 'string'
			},
			visibility: 'public',
			async handler(ctx) {
				const { extensionId, broadcaster } = ctx.params;

				const { deleted } = await this.r.table('extensions_storage').between(
					[extensionId, broadcaster, this.r.minval],
					[extensionId, broadcaster, this.r.maxval]
				).delete();
				return deleted;
			}
		},
		clearStorage: {
			params: {
				extensionId: 'string'
			},
			visibility: 'private',
			async handler(ctx) {
				const { extensionId } = ctx.params;

				await this.r.table('extensions_storage').between(
					[extensionId, this.r.minval, this.r.minval],
					[extensionId, this.r.maxval, this.r.maxval]
				).delete();
			}
		}
  }
};
