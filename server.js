const udp = require('dgram');
const EventEmitter = require('events');
const Packet = require('./packet');
const { fstat, writeFileSync } = require('fs');
/**
 * [Server description]
 * @docs https://tools.ietf.org/html/rfc1034
 * @docs https://tools.ietf.org/html/rfc1035
 */
class Server extends EventEmitter {
  constructor(options, callback) {
    super();
    if (typeof options === 'function') {
      callback = options;
      options = {};
      this.on('request', callback);
    }
    this.socket = udp.createSocket('udp4');
    this.socket.on('message', this.parse.bind(this));
  }
  parse(buffer, rinfo) {
    const request = Packet.parse(buffer);
    this.emit('request', request, this.send.bind(this, rinfo), rinfo);
  }
  send(rinfo, message) {
    if(message instanceof Packet)
      message = message.toBuffer();
    return new Promise((resolve, reject) => {
      this.socket.send(message, rinfo.port, rinfo.address, err => {
        if(err) return reject(err);
        resolve(message);
      });
    });
  }
  listen(port, callback) {
    this.socket.bind(port, callback);
    return this;
  }
  close() {
    this.socket.close();
    this.socket = null;
    return this;
  }
}

module.exports = Server;
