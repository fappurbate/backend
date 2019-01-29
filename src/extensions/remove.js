const fs = require('fs-extra');
const path = require('path');

const db = require('../db');
const config = require('../config');

module.exports.remove = async function remove(arg) {
  const extension = typeof arg === 'object' ? arg : await db.extensions.findOne({ _id: arg });
  if (!extension) {
    throw new CustomError(`Couldn't find extension ${arg}.`, {}, 'ERR_EXTENSION_NOT_FOUND');
  }

  // TODO: stop if running

  const numRemoved = await db.extensions.remove({ _id: extension._id });
  if (numRemoved === 0) {
    throw new CustomError(`Couldn't find extension ${extension.name} (${extension.id}).`, {}, 'ERR_EXTENSION_NOT_FOUND');
  }

  await fs.remove(path.join(config.extensionsPath, extension._id));
}
