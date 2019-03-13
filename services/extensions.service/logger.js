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
    filename: path.join(extensionsPath, extensionId.toString(), 'logs', `${broadcaster}.nedb`)
  });

  transports.on('logged', info => onLogged && setImmediate(() => onLogged(info)));

  const logger = createWinston({
    format: getFormat({ timestamp: false }),
    transports,
    level: 'silly'
  });

  const queue = [];
  let logging = false;

  async function logQueue() {
    if (logging) { return; }
    logging = true;

    while (queue.length > 0) {
      const { method, args } = queue.shift();

      method.apply(logger, args);
      await new Promise(resolve => transports.once('logged', resolve));
    }

    logging = false;
  }

  ['error', 'warn', 'info', 'verbose', 'debug', 'silly'].forEach(level => {
    const method = logger[level];
    logger[level] = function (...args) {
      queue.push({ method, arg });
      logQueue();
    };
  });

  return logger;
}
