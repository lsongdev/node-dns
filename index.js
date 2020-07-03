const udp = require('dgram');
const assert = require('assert');
const Packet = require('./packet');
const { debuglog } = require('util');
const { EventEmitter } = require('events');

const debug = debuglog('dns2');

const createResolver = (address, port) => {
  const client = new udp.Socket('udp4');
  return questions => {
    const query = new DNS.Packet();
    query.header.id = (Math.random() * 1e4) | 0;
    query.questions = questions;
    return new Promise((resolve, reject) => {
      client.once('message', function onMessage(message) {
        client.close();
        const response = Packet.parse(message);
        assert.equal(response.header.id, query.header.id);
        resolve(response);
      });
      debug('send', address, query.toBuffer());
      client.send(query.toBuffer(), port, address, err => err && reject(err));
    });
  }
}

/**
 * [DNS description]
 * @docs https://tools.ietf.org/html/rfc1034
 * @docs https://tools.ietf.org/html/rfc1035
 */
class DNS extends EventEmitter {
  constructor(options) {
    super();
    Object.assign(this, {
      port: 53,
      retries: 3,
      timeout: 3,
      nameServers: [
        '8.8.8.8',
        '114.114.114.114',
      ],
      rootServers: [
        'a', 'b', 'c', 'd', 'e', 'f',
        'g', 'h', 'i', 'j', 'k', 'l', 'm'
      ].map(x => `${x}.root-servers.net`)
    }, options);
  }
  query(questions) {
    if (!Array.isArray(questions))
      questions = [questions];
    const { port, nameServers } = this;
    return Promise.race(nameServers.map(address => {
      const resolve = createResolver(address, port);
      return resolve(questions);
    }));
  }
  resolve(domain, type = 'ANY') {
    return this.query({
      name: domain,
      type: DNS.Packet.TYPE[type],
      class: DNS.Packet.CLASS.IN
    });
  }
  resolveA(domain) {
    return this.resolve(domain, 'A');
  }
  resolveAAAA(domain) {
    return this.resolve(domain, 'AAAA');
  }
  resolveMX(domain) {
    return this.resolve(domain, 'MX');
  }
  resolveCNAME(domain) {
    return this.resolve(domain, 'CNAME');
  }
}

DNS.Client = DNS;
DNS.Packet = Packet;
DNS.Server = require('./server');
DNS.createServer = function (options) {
  return new DNS.Server(options);
};

module.exports = DNS;

