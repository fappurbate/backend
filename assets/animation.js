const wsPort = document.querySelector('meta[data-name="ws-port"]').getAttribute('data-content');
const url = `wss://${window.location.hostname}:${wsPort}`;

const number = document.getElementById('number');

const ws = new WebSocket(url);

ws.addEventListener('open', () => {
  console.log(`Connected to ${url}.`);
});

ws.addEventListener('close', () => {
  console.log(`Connected closed.`);
});

ws.addEventListener('message', event => {
  const { type, data } = JSON.parse(event.data);

  if (type === 'tip') {
    number.innerHTML = data.amount;
    number.style.opacity = 100;
    setTimeout(() => number.style.opacity = 0, 1000);
  }
});
