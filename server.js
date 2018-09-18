const udp = require('dgram');
const EventEmitter = require('events');
const Packet = require('./packet');
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
    var request = Packet.parse(buffer);
    this.emit('request', request, this.send.bind(this, rinfo));
  }
  send(rinfo, response) {
    this.socket.send(response.toBuffer(), rinfo.port, rinfo.address);
  }
  listen(port, callback) {
    this.socket.bind(port, callback);
  }
}

module.exports = Server;