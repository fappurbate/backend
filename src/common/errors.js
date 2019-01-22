module.exports.CustomError = class CustomError extends Error {
  constructor(message, data = undefined) {
    super(message);
    Error.captureStackTrace(this, CustomError);

    this.name = 'CustomError';
    this.data = data;
  }
}
