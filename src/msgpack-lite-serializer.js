'use strict';

const { Base } = require('moleculer').Serializers;

class MsgPackLiteSerializer extends Base {
  init(broker) {
    super.init(broker);
    this.msgpack = require('msgpack-lite');
  }

  serialize(object) {
    return this.msgpack.encode(object);
  }

  deserialize(buffer) {
    return this.msgpack.decode(buffer);
  }
}

module.exports = MsgPackLiteSerializer;
