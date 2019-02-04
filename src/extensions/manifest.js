const Ajv = require('ajv');

const { CustomError } = require('../common/errors');
const { loadExtensionFile } = require('./util');

const ajv = new Ajv;

const validate = ajv.compile({
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'http://example.com/product.schema.json',
  title: 'Manifest',
  description: 'KCK Extension Manifest File',
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    version: { type: 'string' },
    mainScript: { type: 'string' },
    pages: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        additionalProperties: false,
        properties: {
          template: { type: 'string' },
          scripts: {
            type: 'array',
            items: { type: 'string' }
          }
        },
        required: ['template']
      }
    }
  },
  required: ['name', 'description', 'mainScript']
});

module.exports.readManifest =
async function readManifest(extensionPath) {
  const manifestRaw = await loadExtensionFile(
    extensionPath,
    'manifest.json',
    './manifest.json',
    'ERR_LOAD_MANIFEST'
  );

  const manifest = (() => {
    try {
      return JSON.parse(manifestRaw);
    } catch (error) {
      console.error(`Couldn't parse manifest.json (${path}):`, error.message);
      throw new CustomError('Failed to parse manifest.json.', { error }, 'ERR_PARSE_MANIFEST');
    }
  })();

  const valid = validate(manifest);
  if (!valid) {
    console.error(`Invalid manifest.json:`, validate.errors);
    throw new CustomError('Invalid manifest.json.', { errors: validate.errors }, 'ERR_INVALID_MANIFEST');
  }

  return manifest;
}
