const tcp = require('net');
const Packet = require('../packet');

const readStream = socket => {
  let chunks = [];
  let chunklen = 0;
  let received = false;
  let expected = false;
  return new Promise((resolve, reject) => {
    const processMessage = () => {
      if (received) return;
      received = true;
      const buffer = Buffer.concat(chunks, chunklen);
      resolve(buffer.slice(2));
    };
    socket.on('end', processMessage);
    socket.on('error', reject);
    socket.on('readable', () => {
      let chunk;
      while ((chunk = socket.read()) !== null) {
        chunks.push(chunk);
        chunklen += chunk.length;
      }
      if (!expected && chunklen >= 2) {
        if (chunks.length > 1) {
          chunks = [Buffer.concat(chunks, chunklen)];
        }
        expected = chunks[0].readUInt16BE(0);
      }

      if (chunklen >= 2 + expected) {
        processMessage();
      }
    });
  });
};

class Server extends tcp.Server {
  constructor(options) {
    super();
    if (typeof options === 'function') {
      this.on('request', options);
    }
    this.on('connection', this.handle.bind(this));
  }
  async handle(client) {
    const data = await readStream(client);
    const message = Packet.parse(data);
    this.emit('request', message, this.response.bind(this, client), client);
  }
  response(client, message) {
    if (message instanceof Packet)
      message = message.toBuffer();
    const len = Buffer.alloc(2);
    len.writeUInt16BE(message.length);
    client.end(Buffer.concat([len, message]));
  }
}

module.exports = Server;