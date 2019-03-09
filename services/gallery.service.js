'use strict';

const { MoleculerClientError } = require('moleculer').Errors;
const streamMeter = require('stream-meter');
const sharp = require('sharp');
const fileType = require('file-type');
const { Readable } = require('stream');
const RService = require('@kothique/moleculer-rethinkdbdash');

const { streamToBuffer } = require('../src/util.js');

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
        type_id: { $function: [r.row('type'), r.row('id')] },
        filename: true
      }
    }
  }),
  async rOnReady() {
    const cursor = await this.rTable.pluck([
      'id',
      'type',
      'filename',
      'mime'
    ]).changes({
      includeTypes: true
    });
    cursor.each(async (err, change) => {
      if (err) {
        this.logger.warn(`Error while listening to changes in the 'gallery' table.`);
        return;
      }

      if (change.type === 'add') {
        await this.broker.call('gateway.app.broadcast', {
          subject: 'gallery-add',
          data: {
            file: change.new_val
          }
        });
        this.broker.emit('gallery-add', { file: change.new_val });
      } else if (change.type === 'remove') {
        await this.broker.call('gateway.app.broadcast', {
          subject: 'gallery-remove',
          data: {
            file: change.old_val
          }
        });
        this.broker.emit('gallery-remove', { file: change.old_val });
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
          }
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

        let query = this.rTable.between(['image', lastId || this.r.minval], ['image', this.r.maxval], {
          index: 'type_id',
          leftBound: 'open'
        });
        if (typeof limit !== 'undefined') {
          query = query.limit(limit);
        }
        query = query
          .pluck([
            'id',
            'filename',
            'mime',
            ...thumbnails ? [{ thumbnails }] : []
          ])
          .orderBy(this.r.desc('id'));

        const docs = await query;

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
        const { lastId } = ctx.params;
        const limit = typeof ctx.params.limit !== 'undefined' ? Number(ctx.params.limit) : undefined;

        let query = this.rTable.between(['audio', lastId || this.r.minval], ['audio', this.r.maxval], {
          index: 'type_id',
          leftBound: 'open'
        });
        if (typeof limit !== 'undefined') {
          query = query.limit(limit);
        }
        query = query
          .pluck(['id', 'filename', 'mime'])
          .orderBy(this.r.desc('id'));

        const docs = await query;
        return docs;
      }
    }
  }
};
