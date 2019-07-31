const udp    = require('dgram');
const Packet = require('./packet');
/**
 * [DNS description]
 * @docs https://tools.ietf.org/html/rfc1034
 * @docs https://tools.ietf.org/html/rfc1035
 */
function DNS(options){
  Object.assign(this, {
    port: 53,
    retries: 3,
    timeout: 3,
    nameServers: [
      '8.8.8.8',
      '8.8.4.4',
      '114.114.114.114'
    ],
    rootServers: [
      'a','b','c','d','e','f',
      'g','h','i','j','k','l','m'
    ].map(x => `${x}.root-servers.net`)
  }, options);
  return this;
}

DNS.prototype.query = function(domain, type){
  return this.resolve(domain);
};

DNS.prototype.send = function(packet){
  console.log(this.rootServers);
};

DNS.prototype.resolve = function(domain, type, ns){
  // TODO:
};

/**
 * [Server description]
 * @type {[type]}
 */
DNS.Packet = Packet;
DNS.Server = require('./server');
DNS.createServer = function(options){
  return new DNS.Server(options);
};

module.exports = DNS;

