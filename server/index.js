const UDPServer = require('./udp');
const TCPServer = require('./tcp');
const DOHServer = require('./doh');
const DNSServer = require('./dns');

const createUDPServer = options => {
  return new UDPServer(options);
};

const createTCPServer = options => {
  return new TCPServer(options);
};

const createDOHServer = options => {
  return new DOHServer(options);
};

const createServer = options => {
  return new DNSServer(options);
};

module.exports = {
  UDPServer,
  TCPServer,
  DOHServer,
  DNSServer,
  createTCPServer,
  createUDPServer,
  createDOHServer,
  createServer,
};
