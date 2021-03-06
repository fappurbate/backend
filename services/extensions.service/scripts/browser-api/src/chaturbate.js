// there will be no window.parent later
const parent = window.parent;

const eventHandlers = new EventTarget;

let nextRequestId = 0;
const requests = {};

export default ({ id, name, version, broadcaster, init }) => {
  const state = {
    isBroadcasting: Number(init.isBroadcasting),
    isExtractingAccountActivity: Number(init.isExtractingAccountActivity)
  };

  window.addEventListener('message', event => {
    const { subject, data } = event.data;

    if (subject === 'message') {
      const { type, timestamp, data: msgData } = data;

      eventHandlers.dispatchEvent(new CustomEvent('message', {
        detail: {
          type,
          timestamp,
          data: msgData
        }
      }));
    } else if (subject === 'account-activity') {
      const { type, timestamp, data: aaData } = data;

      eventHandlers.dispatchEvent(new CustomEvent('account-activity', {
        detail: {
          type,
          timestamp,
          data: aaData
        }
      }));
    } else if (subject === 'broadcast-start') {
      state.isBroadcasting++;
      eventHandlers.dispatchEvent(new CustomEvent('broadcast-start'));
    } else if (subject === 'broadcast-stop') {
      state.isBroadcasting--;
      eventHandlers.dispatchEvent(new CustomEvent('broadcast-stop'));
    } else if (subject === 'extract-account-activity-start') {
      state.isExtractingAccountActivity++;
      eventHandlers.dispatchEvent(new CustomEvent('extract-account-activity-start'));
    } else if (subject === 'extract-account-activity-stop') {
      state.isExtractingAccountActivity--;
      eventHandlers.dispatchEvent(new CustomEvent('extract-account-activity-stop'));
    }
  });

  return {
    onMessage: {
      addListener: callback => {
        eventHandlers.addEventListener('message', event => {
          const { type, timestamp, data } = event.detail;
          callback(type, timestamp, data);
        });
        return this;
      }
    },
    onAccountActivity: {
      addListener: callback => {
        eventHandlers.addEventListener('account-activity', event => {
          const { type, timestamp, data } = event.detail;
          callback(type, timestamp, data);
        });
        return this;
      }
    },
    onBroadcastStart: {
      addListener: callback => {
        eventHandlers.addEventListener('broadcast-start', () => callback());
        return this;
      }
    },
    onBroadcastStop: {
      addListener: callback => {
        eventHandlers.addEventListener('broadcast-stop', () => callback());
        return this;
      }
    },
    get isBroadcasting() {
      return state.isBroadcasting;
    },
    onExtractAccountActivityStart: {
      addListener: callback => {
        eventHandlers.addEventListener('extract-account-activity-start', () => callback());
        return this;
      }
    },
    onExtractAccountActivityStop: {
      addListener: callback => {
        eventHandlers.addEventListener('extract-account-activity-stop', () => callback());
        return this;
      }
    },
    get isExtractingAccountActivity() {
      return state.isExtractingAccountActivity;
    },
    sendMessage: message => parent.postMessage({
      subject: 'send-message',
      data: { message }
    }, '*')
  };
};
