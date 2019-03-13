'use strict';

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const bufs = [];

    stream.on('error', reject);
    stream.on('data', data => bufs.push(data));
    stream.on('end', () => resolve(Buffer.concat(bufs)));
  });
}
module.exports.streamToBuffer = streamToBuffer;
