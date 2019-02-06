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
  }
});
