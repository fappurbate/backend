export class CustomError extends Error {
  constructor(message, data = undefined, code = undefined) {
    super(message);
    Error.captureStackTrace(this, CustomError);

    this.name = 'CustomError';
    this.data = data;
    this.code = code;
  }
}
