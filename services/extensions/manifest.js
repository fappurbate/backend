const Ajv = require('ajv');
const { MoleculerError } = require('moleculer').Errors;

const { loadExtensionFile } = require('./util');

const ajv = new Ajv;

const validate = ajv.compile({
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'http://example.com/product.schema.json',
  title: 'Manifest',
  description: 'Fappurbate Extension Manifest File',
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
      throw new MoleculerError('Failed to parse manifest.json.', 500, 'ERR_PARSE_MANIFEST', { error });
    }
  })();

  const valid = validate(manifest);
  if (!valid) {
    throw new MoleculerError('Invalid manifest.json.', 500, 'ERR_INVALID_MANIFEST', { errors: validate.errors });
  }

  if (Object.keys(manifest.pages || {}).some(name => name.indexOf('@') !== -1)) {
    throw new MoleculerError('Invalid maniest.json.', 500, 'ERR_INVALID_MANIFEST', { error: 'A page name cannot contain \'@\'.' });
  }

  return manifest;
}
