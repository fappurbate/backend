'use strict';

const { MoleculerClientError } = require('moleculer').Errors;
const streamMeter = require('stream-meter');
const sharp = require('sharp');
const fileType = require('file-type');
const { Readable } = require('stream');
const RService = require('@kothique/moleculer-rethinkdbdash');

const { streamToBuffer } = require('../common/util.js');

module.exports = {
  name: 'gallery',
  mixins: [RService],
  settings: {
    thumbnailSizes: {
      small: 128,
      medium: 172,
      large: 256
    },
    preview: {
      width: 1024,
      height: 768
    }
  },
  rOptions: {
    db: 'fappurbate'
  },
  rInitial: r => ({
    fappurbate: {
      gallery: {
        $default: true,
        filename: true,
        type_createdAt: { $function : [r.row('type'), r.row('createdAt')] }
      }
    }
  }),
  async rOnReady() {
    this.lastId = {
      image: await this.getLastId('image'),
      audio: await this.getLastId('audio')
    };

    const cursor = await this.rTable.pluck([
      'id',
      'type',
      'filename',
      'mime',
      'createdAt'
    ]).changes({
      includeTypes: true
    });
    cursor.each(async (error, change) => {
      if (error) {
        this.logger.warn(`Error while listening to changes in the 'gallery' table.`, { error });
        return;
      }

      if (change.type === 'add') {
        this.lastId[change.new_val.type] = change.new_val.createdAt;

        await this.broker.call('gateway.app.broadcast', {
          subject: 'gallery-add',
          data: {
            file: change.new_val
          }
        });
        this.broker.emit('gallery.add', { file: change.new_val });
      } else if (change.type === 'remove') {
        if (this.lastId.image && change.old_val.createdAt.valueOf() === this.lastId.image.valueOf()) {
          this.lastId.image = await this.getLastId('image');
        }

        await this.broker.call('gateway.app.broadcast', {
          subject: 'gallery-remove',
          data: {
            file: change.old_val
          }
        });
        this.broker.emit('gallery.remove', { file: change.old_val });
      }
    });
  },
  methods: {
    async generateThumbnails(buffer) {
      const result = {};

      await Promise.all(Object.keys(this.settings.thumbnailSizes).map(size => sharp(buffer)
        .resize({
          width: this.settings.thumbnailSizes[size],
          height: this.settings.thumbnailSizes[size],
          fit: 'contain',
          position: 'center',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png()
        .toBuffer()
        .then(thumbnail => result[size] = thumbnail)
      ));

      return result;
    },
    async generatePreview(buffer) {
      const metadata = await sharp(buffer).metadata();

      if (metadata.width <= this.settings.preview.width &&
          metadata.height <= this.settings.preview.height) {
        return buffer;
      }

      return sharp(buffer)
      .resize({
        width: this.settings.preview.width,
        height: this.settings.preview.height,
        fit: 'inside',
        position: 'center',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toBuffer();
    },
    getLastId(type) {
      return this.rTable
        .between([type, this.r.minval], [type, this.r.maxval], { index: 'type_createdAt' })
        .orderBy({ index: this.r.asc('type_createdAt') })
        .limit(1).getField('createdAt')
        .nth(0).default(null);
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

        const createdAt = new Date;
        const { generated_keys: [id] } = await this.rTable.insert({
          type,
          filename: (() => {
            if (filename.endsWith(ft.ext)) {
              return filename;
            } else {
              return `${filename}.${ft.ext}`;
            }
          })(),
          mime: ft.mime,
          file: buffer,
          ...type === 'image' && {
            thumbnails: await this.generateThumbnails(buffer),
            preview: await this.generatePreview(buffer)
          },
          createdAt
        });

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

        const { deleted } = await this.rTable.get(fileId).delete();

        if (deleted === 0) {
          throw new MoleculerClientError('File not found.', 404, 'ERR_FILE_NOT_FOUND');
        }
      }
    },
    getFile: {
      params: {
        fileId: 'string',
        encoding: { type: 'enum', values: ['base64', 'binary'], optional: true }
      },
      visibility: 'published',
      async handler(ctx) {
        const { fileId, encoding = 'binary' } = ctx.params;

        const file = await this.rTable.get(fileId);
        if (!file) {
          throw new MoleculerClientError('File not found.', 404, 'ERR_FILE_NOT_FOUND');
        }

        ctx.meta.contentType = file.mime;
        ctx.meta.contentLength = file.file.length;

        return encoding === 'base64' ? file.file.toString('base64') : file.file;
      }
    },
    getMetadata: {
      params: {
        fileId: 'string'
      },
      visibility: 'published',
      async handler(ctx) {
        const { fileId } = ctx.params;

        const metadata = await this.rTable.get(fileId).pluck([
          'id',
          'type',
          'filename',
          'mime'
        ]);
        if (!metadata) {
          throw new MoleculerClientError('File not found.', 404, 'ERR_FILE_NOT_FOUND');
        }

        return metadata;
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
        const lastId = ctx.params.lastId && new Date(ctx.params.lastId);
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

        let query = this.rTable
          .between(['image', this.r.minval], ['image', lastId || this.r.maxval], {
            index: 'type_createdAt',
            rightBound: 'open'
          })
          .orderBy({ index: this.r.desc('type_createdAt') });
        if (typeof limit !== 'undefined') {
          query = query.limit(limit);
        }
        query = query
          .pluck([
            'id',
            'filename',
            'mime',
            ...thumbnails ? [{ thumbnails }] : [],
            'createdAt'
          ]);

        const items = await query;

        if (thumbnails) {
          items.forEach(item => {
            const buffer = item.thumbnails[thumbnails];
            delete item.thumbnails;
            item.thumbnail = buffer.toString('base64');
          });
        }

        if (items.length === 0 || items[items.length - 1].createdAt.valueOf() === this.lastId.image.valueOf()) {
          return { items, all: true };
        } else {
          return { items, all: false };
        }
      }
    },
    getThumbnail: {
      params: {
        fileId: 'string',
        size: { type: 'enum', values: ['small', 'medium', 'large'], optional: true }
      },
      visibility: 'published',
      async handler(ctx) {
        const { fileId, size = 'small' } = ctx.params;

        const thumbnail = await this.rTable.get(fileId).getField('thumbnails').getField(size);
        if (!thumbnail) {
          throw new MoleculerClientError('File is not image or not found.', null, 'ERR_NOT_IMAGE_OR_NOT_FOUND');
        }

        return thumbnail.toString('base64');
      }
    },
    getPreview: {
      params: {
        fileId: 'string',
        encoding: { type: 'enum', values: ['base64', 'binary'], optional: true }
      },
      visibility: 'published',
      async handler(ctx) {
        const { fileId, encoding = 'binary' } = ctx.params;

        const preview = await this.rTable.get(fileId).pluck(['id', 'filename', 'mime', 'preview']);
        if (!preview) {
          throw new MoleculerClientError('File is not image or not found.', null, 'ERR_NOT_IMAGE_OR_NOT_FOUND');
        }

        ctx.meta.contentType = preview.mime;
        ctx.meta.contentLength = preview.preview.length;

        return encoding === 'base64' ? preview.preview.toString('base64') : preview.preview;
      }
    },
    getAudio: {
      params: {
        lastId: { type: 'string', optional: true },
        limit: { type: 'number', optional: true, integer: true, convert: true }
      },
      visibility: 'published',
      async handler(ctx) {
        const lastId = ctx.params.lastId && new Date(ctx.params.lastId);
        const limit = typeof ctx.params.limit !== 'undefined' ? Number(ctx.params.limit) : undefined;

        let query = this.rTable
          .between(['audio', this.r.minval], ['audio', lastId || this.r.maxval], {
            index: 'type_createdAt',
            rightBound: 'open'
          })
          .orderBy({ index: this.r.desc('type_createdAt') });
        if (typeof limit !== 'undefined') {
          query = query.limit(limit);
        }
        query = query
          .pluck(['id', 'filename', 'mime', 'createdAt']);

        const items = await query;

        if (items.length === 0 || items[items.length - 1].createdAt.valueOf() === this.lastId.audio.valueOf()) {
          return { items, all: true };
        } else {
          return { items, all: false };
        }
      }
    }
  }
};
