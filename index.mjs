import dns from './index.js';

export default dns;

export const {
  TCPServer,
  UDPServer,
  DOHServer,
  createUDPServer,
  createTCPServer,
  createDOHServer,
  createServer,
  TCPClient,
  DOHClient,
  UDPClient,
  GoogleClient,
  Packet,
} = dns;
