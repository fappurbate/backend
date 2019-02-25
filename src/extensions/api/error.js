module.exports = class FappurbateError extends Error {
  constructor(message, type, data) {
    super(message);
    Error.captureStackTrace(this, FappurbateError);

    this.name = 'FappurbateError';
    this.type = type;
    this.data = data;
  }
};
