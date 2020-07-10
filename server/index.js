const UDPServer = require('./udp');
const TCPServer = require('./tcp');

const createUDPServer = options => {
  return new UDPServer(options);
};

const createTCPServer = options => {
  return new TCPServer(options);
};

module.exports = {
  UDPServer,
  TCPServer,
  createTCPServer,
  createUDPServer,
};