const tcp = require('net');
const Packet = require('../packet');

class Server extends tcp.Server {
  constructor(options) {
    super();
    if (typeof options === 'function') {
      this.on('request', options);
    }
    this.on('connection', this.handle.bind(this));
  }

  async handle(client) {
    try {
      const data = await Packet.readStream(client);
      const message = Packet.parse(data);
      this.emit('request', message, this.response.bind(this, client), client);
    } catch (e) {
      this.emit('requestError', e);
      client.destroy();
    }
  }

  response(client, message) {
    if (message instanceof Packet) {
      message = message.toBuffer();
    }
    const len = Buffer.alloc(2);
    len.writeUInt16BE(message.length);
    client.end(Buffer.concat([ len, message ]));
  }
}

module.exports = Server;
