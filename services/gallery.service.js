'use strict';

const { MoleculerClientError } = require('moleculer').Errors;
const RethinkDBAdapter = require('moleculer-db-adapter-rethinkdb');
const DBService = require('moleculer-db');
const r = require('rethinkdb');
const { streamToBuffer } = require('../src/util.js');

module.exports = {
  name: 'gallery',
  mixins: [DBService],
  adapter: new RethinkDBAdapter({ host: '127.0.0.1', port: 28015 }),
  database: 'fappurbate',
  table: 'gallery',
  methods: {
    rTable() { return this.adapter.getTable(); }
  },
  async afterConnected() {
    const indices = await this.rTable().indexList().run(this.adapter.client);

    if (indices.length === 0) {
      await this.rTable().indexCreate('type_id', [r.row('type'), r.row('id')]).run(this.adapter.client);
      await this.rTable().indexCreate('filename').run(this.adapter.client);
    }
  },
  actions: {
    addFile: {
      params: {
        type: { type: 'enum', values: ['image', 'audio'] },
        filename: 'string',
        file: 'stream'
      },
      visibility: 'published',
      async handler(ctx) {
        const { type, filename, file } = ctx.params;

        const { generated_keys: [id] } = await this.rTable().insert({
          type,
          filename,
          file: await streamToBuffer(file)
        }).run(this.adapter.client);

        return id;
      }
    },
    removeFile: {
      params: {
        fileId: 'string'
      },
      visibility: 'published',
      async handler(ctx) {
        const { fileId } = ctx.params;

        const { deleted } = await this.rTable().get(fileId).delete().run(this.adapter.client);

        if (deleted === 0) {
          throw new MoleculerClientError('File not found.', 404, 'ERR_FILE_NOT_FOUND');
        }
      }
    },
    getFile: {
      params: {
        fileId: 'string'
      },
      visibility: 'published',
      async handler(ctx) {
        const { fileId } = ctx.params;

        const file = await this.rTable().get(fileId).getField('file').run(this.adapter.client);
        if (!file) {
          throw new MoleculerClientError('File not found.', 404, 'ERR_FILE_NOT_FOUND');
        }

        return file;
      }
    },
    getAudio: {
      params: {
        lastId: { type: 'string', optional: true }
      },
      visibility: 'published',
      async handler(ctx) {
        const { lastId } = ctx.params;

        const docs = await this.rTable().between(['audio', lastId || r.minval], ['audio', r.maxval], {
          index: 'type_id',
          leftBound: 'open'
        }).pluck(['id', 'filename']).run(this.adapter.client).then(cursor => cursor.toArray());

        return docs;
      }
    }
  }
};
