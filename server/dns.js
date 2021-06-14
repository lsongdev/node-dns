const EventEmitter = require('events');
const DOHServer = require('./doh');
const TCPServer = require('./tcp');
const UDPServer = require('./udp');

class DNSServer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.servers = {};
    if (options.doh) {
      this.servers.doh = (new DOHServer(options.doh))
        .on('error', error => this.emit('error', error, 'doh'));
    }
    if (options.tcp) {
      this.servers.tcp = (new TCPServer())
        .on('error', error => this.emit('error', error, 'tcp'));
    }
    if (options.udp) {
      this.servers.udp = (new UDPServer(typeof options.udp === 'object' ? options.udp : undefined))
        .on('error', error => this.emit('error', error, 'udp'));
    }
    const servers = Object.values(this.servers);
    this.closed = Promise.all(
      servers.map(server => new Promise(resolve => server.once('close', resolve))),
    ).then(() => {
      this.emit('close');
    });

    this.listening = Promise.all(
      servers.map(server => new Promise(resolve => server.once('listening', resolve))),
    ).then(() => {
      const addresses = this.addresses();
      this.emit('listening', addresses);
      return addresses;
    });

    const emitRequest = (request, send, client) => this.emit('request', request, send, client);
    for (const server of servers) {
      server.on('request', emitRequest);
    }

    if (options.handle) {
      this.on('request', options.handle.bind(options));
    }
  }

  addresses() {
    const addresses = {};
    const { udp, tcp, doh } = this.servers;
    if (udp) {
      addresses.udp = udp.address();
    }
    if (tcp) {
      addresses.tcp = tcp.address();
    }
    if (doh) {
      addresses.doh = doh.address();
    }
    return addresses;
  }

  listen(ports = {}) {
    const { udp, tcp, doh } = this.servers;
    if (udp) {
      udp.listen(ports.udp);
    }
    if (tcp) {
      tcp.listen(ports.tcp);
    }
    if (doh) {
      doh.listen(ports.doh);
    }
    return this.listening;
  }

  close() {
    const { doh, udp, tcp } = this.servers;
    if (udp) {
      udp.close();
    }
    if (tcp) {
      tcp.close();
    }
    if (doh) {
      doh.close();
    }
    return this.closed;
  }
}

module.exports = DNSServer;
