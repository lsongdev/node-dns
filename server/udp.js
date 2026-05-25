const udp = require('node:dgram');
const Packet = require('../packet');
const proxyProtocol = require('../lib/proxy-protocol');

/**
 * [Server description]
 * @docs https://tools.ietf.org/html/rfc1034
 * @docs https://tools.ietf.org/html/rfc1035
 */
class Server extends udp.Socket {
  constructor(options) {
    let type = 'udp4';
    let proxyProtocolEnabled = false;
    if (typeof options === 'object' && options !== null) {
      type = options.type ?? type;
      proxyProtocolEnabled = options.proxyProtocol ?? false;
    }
    super(type);
    this.proxyProtocol = proxyProtocolEnabled;
    if (typeof options === 'function') {
      this.on('request', options);
    }
    this.on('message', this.handle.bind(this));
  }

  handle(data, rinfo) {
    try {
      // Response is always sent back to the immediate sender (the proxy when
      // proxyProtocol is enabled); the parsed client info is exposed to the
      // request handler so it can log/authorize against the real peer.
      const responder = rinfo;
      let clientInfo = rinfo;
      if (this.proxyProtocol) {
        const parsed = proxyProtocol.parse(data);
        if (!parsed) throw new Error('PROXY protocol: incomplete header');
        if (parsed.header.command === 'PROXY') {
          clientInfo = {
            ...rinfo,
            address : parsed.header.sourceAddress,
            port    : parsed.header.sourcePort,
            proxy   : parsed.header,
          };
        } else {
          clientInfo = { ...rinfo, proxy: parsed.header };
        }
        data = data.slice(parsed.headerLength);
      }
      const message = Packet.parse(data);
      this.emit('request', message, this.response.bind(this, responder), clientInfo);
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
