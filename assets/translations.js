const wsHost = document.querySelector('meta[data-name="ws-host"]').getAttribute('data-content');
const wsPort = document.querySelector('meta[data-name="ws-port"]').getAttribute('data-content');
const url = `wss://${wsHost}:${wsPort}`;

const alert = document.getElementById('alert');

const ws = new WebSocket(url);

ws.addEventListener('open', () => {
  console.log(`Connected to ${url}.`);
});

ws.addEventListener('close', () => {
  console.log(`Connected closed.`);
});

ws.addEventListener('message', async event => {
  const { type, data } = JSON.parse(event.data);

  if (type === 'translation-request') {
    alert.innerHTML = 'new stuff is here!';
    const notification = await spawnNotification('New Translation Request', {
      body: data.content,
      icon: '/assets/logo.png',
      requireInteraction: true,
      renotify: true,
      tag: 'kothique-chaturbate-backend-translation-request'
    });
    if (notification) {
      notification.addEventListener('click', () => {
        window.focus();
        window.location.reload();
        notification.close();
      });
    }
  }
});

document.querySelectorAll('.translation-request').forEach(form => {
  const msgId = Number(form.getAttribute('data-msg-id'));
  const tabId = Number(form.getAttribute('data-tab-id'));

  const translation = form.querySelector('.translation');

  const link = form.querySelector('.send-link');
  link.addEventListener('click', () => {
    ws.send(JSON.stringify({
      type: 'translation',
      data: {
        msgId,
        tabId,
        content: translation.value
      }
    }));
    window.location.reload(true);
  });
});

// ====================

async function spawnNotification(title, options = undefined) {
  if (!('Notification' in window)) {
    console.log('This browser does not support desktop notification');
    return null;
  } else if (Notification.permission === 'granted') {
    return new Notification(title, options);
  } else if (Notification.permission !== 'denied') {
    if (await Notification.requestPermission() === 'granted') {
      return new Notification(title, options);
    }
  }
}
