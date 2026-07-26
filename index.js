const {
  TCPServer,
  UDPServer,
  DOHServer,
  createTCPServer,
  createUDPServer,
  createDOHServer,
  createServer,
} = require('./server');
const EventEmitter = require('node:events');

/**
 * [DNS description]
 * @docs https://tools.ietf.org/html/rfc1034
 * @docs https://tools.ietf.org/html/rfc1035
 */
class DNS extends EventEmitter {
  constructor(options = {}) {
    super();
    // Accept `dns` as a shorthand alias for `nameServers` so that
    // `new DNS({ dns: '8.8.8.8' })` works as documented and intuited.
    if (options.dns != null && options.nameServers == null) {
      options = Object.assign({}, options, {
        nameServers: [].concat(options.dns),
      });
    }
    Object.assign(
      this,
      {
        port: 53,
        retries: 3,
        timeout: 3000, // milliseconds
        recursive: true,
        retryOverTCP: true,
        resolverProtocol: 'UDP',
        nameServers: ['8.8.8.8', '114.114.114.114'],
        rootServers: [
          'a',
          'b',
          'c',
          'd',
          'e',
          'f',
          'g',
          'h',
          'i',
          'j',
          'k',
          'l',
          'm',
        ].map(x => `${x}.root-servers.net`),
      },
      options,
    );
  }

  /**
   * resolve
   * @param {*} domain
   * @param {*} type
   * @param {*} cls
   */
  async resolve(domain, type = 'ANY', cls = DNS.Packet.CLASS.IN, options = {}) {
    const {
      port,
      nameServers,
      resolverProtocol = 'UDP',
      retryOverTCP,
      timeout,
    } = this;
    const createResolver = DNS[resolverProtocol + 'Client'];
    try {
      // Promise.any, so one unreachable or misbehaving name server doesn't
      // fail the lookup while another is able to answer.
      return await Promise.any(
        nameServers.map(address => {
          const resolve = createResolver({
            dns: address,
            port,
            retryOverTCP,
            timeout,
          });
          return resolve(domain, type, cls, options);
        }),
      );
    } catch (e) {
      // AggregateError's own message ("All promises were rejected") hides which
      // server failed and why; name each one.
      if (!(e instanceof AggregateError)) throw e;
      const reasons = nameServers
        .map((address, i) => `${address}: ${e.errors[i]?.message}`)
        .join('; ');
      throw new Error(
        `${type} lookup of ${domain} failed on all ${nameServers.length} ` +
          `name server(s) — ${reasons}`,
        { cause: e },
      );
    }
  }

  resolveA(domain, clientIp) {
    return this.resolve(domain, 'A', undefined, clientIp ? { clientIp } : {});
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

  resolvePTR(domain) {
    return this.resolve(domain, 'PTR');
  }

  resolveDNSKEY(domain) {
    return this.resolve(domain, 'DNSKEY');
  }

  resolveRRSIG(domain) {
    return this.resolve(domain, 'RRSIG');
  }

  resolveSOA(domain) {
    return this.resolve(domain, 'SOA');
  }
}

DNS.TCPServer = TCPServer;
DNS.UDPServer = UDPServer;
DNS.DOHServer = DOHServer;

DNS.createUDPServer = createUDPServer;
DNS.createTCPServer = createTCPServer;
DNS.createDOHServer = createDOHServer;
DNS.createServer = createServer;

DNS.TCPClient = require('./client/tcp');
DNS.DOHClient = require('./client/doh');
DNS.UDPClient = require('./client/udp');
DNS.GoogleClient = require('./client/google');

DNS.Packet = require('./packet');

module.exports = DNS;
