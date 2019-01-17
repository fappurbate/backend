module.exports = class RequestTarget {
  constructor() {
    this.handlers = {};
  }

  on(subject, handler) {
    const rewrite = Boolean(this.handlers[subject]);

    this.handlers[subject] = handler;
    if (rewrite) {
      console.warn(`RequestTarget: rewriting existing handler: ${subject}.`);
    }
  }

  off(subject) {
    delete this.handlers[subject];
  }

  async request(subject, data) {
    const handler = this.handlers[subject];
    if (!handler) {
      console.warn(`RequestTarget: no handler found: ${subject}.`);
    }

    const result = await handler(data);
    return result;
  }
}
