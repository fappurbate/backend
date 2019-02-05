const idNode = document.querySelector('meta[data-name="id"]');
const nameNode = document.querySelector('meta[data-name="name"]');
const versionNode = document.querySelector('meta[data-name="version"]');
const broadcasterNode = document.querySelector('meta[data-name="broadcaster"]');

window.kck = {
  runtime: {
    id: idNode.getAttribute('data-content'),
    name: nameNode.getAttribute('data-content'),
    version: versionNode ? versionNode.getAttribute('data-content') : null,
    broadcaster: broadcasterNode.getAttribute('data-content')
  },
  test: {
    say: (...args) => {
      document.write(args.join(' '));
    }
  }
};
