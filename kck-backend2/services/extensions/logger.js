const path = require('path');
const { createLogger: createWinston, format, transports } = require('winston');
const WinstonNeDB = require('@kothique/winston-nedb');

const getFormat = ({ namespace = null, timestamp = true }) => format.combine(
  ...namespace ? [format.label({ label: namespace })] : [],
  ...timestamp ? [format.timestamp()] : [],
  format.printf(info =>
    `${info.timestamp} [${info.level.toUpperCase()}] ${info.label} | ${info.message}` +
    (info.error ? `\n${info.error.stack}` : ``)
  )
);

module.exports.createLogger = function createVMLogger(options) {
  const { extensionId, extensionsPath, broadcaster, onLogged = null } = options;

  const transports = new WinstonNeDB({
    filename: path.join(extensionsPath, extensionId, 'logs', `${broadcaster}.nedb`)
  });

  transports.on('logged', info => onLogged && setImmediate(() => onLogged(info)));

  return createWinston({
    format: getFormat({ timestamp: false }),
    transports,
    level: 'silly'
  });
}
