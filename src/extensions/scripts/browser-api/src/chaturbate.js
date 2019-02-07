const eventHandlers = new EventTarget;

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
    eventHandlers.dispatchEvent(new CustomEvent('broadcast-start'));
  } else if (subject === 'broadcast-stop') {
    eventHandlers.dispatchEvent(new CustomEvent('broadcast-stop'));
  } else if (subject === 'extract-account-activity-start') {
    eventHandlers.dispatchEvent(new CustomEvent('extract-account-activity-start'));
  } else if (subject === 'extract-account-activity-stop') {
    eventHandlers.dispatchEvent(new CustomEvent('extract-account-activity-stop'));
  }
});

export default ({ id, name, version, broadcaster }) => ({
  onMessage: {
    addListener: callback => {
      eventHandlers.addEventListener('message', event => {
        const { type, timestamp, data } = event.detail;
        callback(type, timestamp, data);
      })
    }
  },
  onAccountActivity: {
    addListener: callback => {
      eventHandlers.addEventListener('account-activity', event => {
        const { type, timestamp, data } = event.detail;
        callback(type, timestamp, data);
      })
    }
  },
  onBroadcastStart: {
    addListener: callback => {
      eventHandlers.addEventListener('broadcast-start', () => callback());
    }
  },
  onBroadcastStop: {
    addListener: callback => {
      eventHandlers.addEventListener('broadcast-stop', () => callback());
    }
  },
  onExtractAccountActivityStart: {
    addListener: callback => {
      eventHandlers.addEventListener('extract-account-activity-start', () => callback());
    }
  },
  onExtractAccountActivityStop: {
    addListener: callback => {
      eventHandlers.addEventListener('extract-account-activity-stop', () => callback());
    }
  }
});
