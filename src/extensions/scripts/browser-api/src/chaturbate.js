const eventHandlers = new EventTarget;

window.addEventListener('message', event => {
  const { subject, data } = event.data;

  if (subject === 'message') {
    const { type, data: msgData } = data;

    eventHandlers.dispatchEvent(new CustomEvent('message', {
      detail: {
        type,
        data: msgData
      }
    }));
  } else if (subject === 'account-activity') {
    const { type, data: aaData } = data;

    eventHandlers.dispatchEvent(new CustomEvent('account-activity', {
      detail: {
        type,
        data: aaData
      }
    }));
  }
});

export default ({ id, name, version, broadcaster }) => ({
  onMessage: {
    addListener: callback => {
      eventHandlers.addEventListener('message', event => {
        const { type, data } = event.detail;
        callback(type, data);
      })
    }
  },
  onAccountActivity: {
    addListener: callback => {
      eventHandlers.addEventListener('account-activity', event => {
        const { type, data } = event.detail;
        callback(type, data);
      })
    }
  }
});
