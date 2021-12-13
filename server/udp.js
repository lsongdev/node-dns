const udp = require('dgram');
const Packet = require('../packet');

/**
 * [Server description]
 * @docs https://tools.ietf.org/html/rfc1034
 * @docs https://tools.ietf.org/html/rfc1035
 */
class Server extends udp.Socket {
  constructor(options) {
    let type = 'udp4';
    if (typeof options === 'object') {
      type = options.type;
    }
    super(type);
    if (typeof options === 'function') {
      this.on('request', options);
    }
    this.on('message', this.handle.bind(this));
  }

  handle(data, rinfo) {
    try {
      const message = Packet.parse(data);
      this.emit('request', message, this.response.bind(this, rinfo), rinfo);
    } catch (e) {
      this.emit('requestError', e);
    }
  }

  response(rinfo, message) {
    if (message instanceof Packet) { message = message.toBuffer(); }
    return new Promise((resolve, reject) => {
      this.send(message, rinfo.port, rinfo.address, err => {
        if (err) return reject(err);
        resolve(message);
      });
    });
  }

  listen(port, address) {
    return new Promise(resolve =>
      this.bind(port, address, resolve));
  }
}

module.exports = Server;
