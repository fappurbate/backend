'use strict';

const { MoleculerClientError } = require('moleculer').Errors;
const RethinkDBAdapter = require('moleculer-db-adapter-rethinkdb');
const DBService = require('moleculer-db');
const r = require('rethinkdb');
const { streamToBuffer } = require('../src/util.js');
const streamMeter = require('stream-meter');
const sharp = require('sharp');
const fileType = require('file-type');

module.exports = {
  name: 'gallery',
  mixins: [DBService],
  settings: {
    thumbnailSizes: {
      small: 128,
      medium: 256,
      large: 512
    }
  },
  adapter: new RethinkDBAdapter({ host: '127.0.0.1', port: 28015 }),
  database: 'fappurbate',
  table: 'gallery',
  methods: {
    rTable() { return this.adapter.getTable(); },
    async generateThumbnails(buffer) {
      const result = {};

      await Promise.all(Object.keys(this.settings.thumbnailSizes).map(size => sharp(buffer)
        .resize({
          width: this.settings.thumbnailSizes[size],
          height: this.settings.thumbnailSizes[size],
          fit: 'contain',
          position: 'center'
        })
        .png()
        .toBuffer()
        .then(thumbnail => result[size] = thumbnail)
      ));

      return result;
    }
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

        const meter = streamMeter();
        const buffer = await streamToBuffer(file.pipe(meter));

        const ft = fileType(buffer);

        if (type === 'image' && !(ft && ft.mime.startsWith('image/'))) {
          throw new MoleculerClientError('The file provided is not an image.', 422, 'ERR_INVALID_FILE');
        } else if (type === 'audio' && !(ft && ft.mime.startsWith('audio/'))) {
          throw new MoleculerClientError('The file provided is not audio.', 422, 'ERR_INVALID_FILE');
        }

        const { generated_keys: [id] } = await this.rTable().insert({
          type,
          filename,
          file: buffer,
          ...type === 'image' && {
            thumbnails: await this.generateThumbnails(buffer)
          }
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
    getImages: {
      params: {
        lastId: { type: 'string', optional: true },
        limit: { type: 'number', optional: true, integer: true, convert: true },
        thumbnails: [
          { type: 'enum', values: ['false', 'true', 'small', 'medium', 'large'], optional: true }
        ]
      },
      visibility: 'published',
      async handler(ctx) {
        const { lastId } = ctx.params;
        const limit = typeof ctx.params.limit !== 'undefined' ? Number(ctx.params.limit) : undefined;
        const thumbnails = (field => {
          if (!field || field === 'true') {
            return 'small';
          } else if (field === 'false') {
            return false;
          } else {
            return field;
          }
        })(ctx.params.thumbnails);

        let query = this.rTable().between(['image', lastId || r.minval], ['image', r.maxval], {
          index: 'type_id',
          leftBound: 'open'
        });
        if (typeof limit !== 'undefined') {
          query = query.limit(limit);
        }
        query = query.pluck([
          'id',
          'filename',
          ...thumbnails ? [{ thumbnails }] : []
        ]);

        const docs = await query.run(this.adapter.client).then(cursor => cursor.toArray());

        if (thumbnails) {
          docs.forEach(doc => {
            const buffer = doc.thumbnails[thumbnails];
            delete doc.thumbnails;
            doc.thumbnail = buffer.toString('base64');
          });
        }

        return docs;
      }
    },
    getAudio: {
      params: {
        lastId: { type: 'string', optional: true },
        limit: { type: 'number', optional: true, integer: true, convert: true }
      },
      visibility: 'published',
      async handler(ctx) {
        const { lastId } = ctx.params;
        const limit = typeof ctx.params.limit !== 'undefined' ? Number(ctx.params.limit) : undefined;

        let query = this.rTable().between(['audio', lastId || r.minval], ['audio', r.maxval], {
          index: 'type_id',
          leftBound: 'open'
        });
        if (typeof limit !== 'undefined') {
          query = query.limit(limit);
        }
        query = query.pluck(['id', 'filename']);

        const docs = await query.run(this.adapter.client).then(cursor => cursor.toArray());

        return docs;
      }
    }
  }
};
