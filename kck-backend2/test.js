const io = require('socket.io-client')

const socket = io('http://localhost:3000/ext')

socket.emit('test', 'moew', console.log)
