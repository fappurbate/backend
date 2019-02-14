'use strict';

module.exports = {
  name: 'messages',
  events: {
    async 'broadcast.message'(payload) {
      const { info, type, timestamp, data } = payload;

      await this.broker.call('gateway.app.broadcast', {
        subject: 'message',
        data: payload
      });

      if (!info.chat.active || !info.broadcast.active) { return; }

      const isBroadcasting = await this.broker.call('broadcasters.isBroadcasting', {
        broadcaster: info.chat.owner
      });

      if (type === 'tip' && isBroadcasting) {
        const { username, amount } = data;

        await this.broker.call('tippers.addTip', {
          username,
          broadcaster: info.chat.owner,
          amount
        });
      }
    }
  }
};
