const Ajv = require('ajv');

const ajv = new Ajv;

module.exports.validateManifest = ajv.compile({
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'http://example.com/product.schema.json',
  title: 'Manifest',
  description: 'KCK Extension Manifest File',
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    background: {
      type: 'object',
      additionalProperties: false,
      properties: {
        scripts: {
          type: 'array',
          items: { type: 'string' }
        }
      },
      required: ['scripts']
    },
    front: {
      type: 'object',
      additionalProperties: false,
      properties: {
        page: { type: 'string' },
        scripts: {
          type: 'array',
          items: { type: 'string' }
        }
      },
      required: ['page']
    },
    settings: {
      type: 'object',
      additionalProperties: false,
      properties: {
        page: { type: 'string' },
        scripts: {
          type: 'array',
          items: { type: 'string' }
        }
      },
      required: ['page']
    },
    stream: {
      type: 'object',
      additionalProperties: false,
      properties: {
        page: { type: 'string' },
        scripts: {
          type: 'array',
          items: { type: 'string' }
        }
      },
      required: ['page']
    },
  },
  required: ['name', 'description']
});
