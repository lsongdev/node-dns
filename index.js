const udp = require('dgram');
const Packet = require('./packet');

const createResolver = (client, address, port) => {
  return questions => {
    const query = new DNS.Packet();
    query.questions = questions;
    return new Promise((resolve, reject) => {
      client.once('message', message => {
        const response = Packet.parse(message);
        resolve(response.answers);
      });
      client.send(query.toBuffer(), port, address, err => err && reject(err));
    });
  }
}

/**
 * [DNS description]
 * @docs https://tools.ietf.org/html/rfc1034
 * @docs https://tools.ietf.org/html/rfc1035
 */
class DNS extends udp.Socket {
  constructor(options) {
    super('udp4');
    Object.assign(this, {
      port: 53,
      retries: 3,
      timeout: 3,
      nameServers: [
        '8.8.8.8',
        '1.1.1.1',
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
      const resolve = createResolver(this, address, port);
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

