const UDPServer = require('./udp');
const TCPServer = require('./tcp');
const DOHServer = require('./doh');

const createUDPServer = options => {
  return new UDPServer(options);
};

const createTCPServer = options => {
  return new TCPServer(options);
};

const createDOHServer = options => {
  return new DOHServer(options);
};

module.exports = {
  UDPServer,
  TCPServer,
  DOHServer,
  createTCPServer,
  createUDPServer,
  createDOHServer,
};
