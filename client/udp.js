const udp = require('node:dgram');
const net = require('node:net');
const crypto = require('node:crypto');
const Packet = require('../packet');
const { debuglog } = require('node:util');

const debug = debuglog('dns2');

module.exports = ({
  dns = '8.8.8.8',
  port = 53,
  socketType = 'udp4',
  timeout = 10000,
  retryOverTCP = true,
} = {}) => {
  return (name, type = 'A', cls = Packet.CLASS.IN, options = {}) => {
    const { clientIp, recursive = true } = options;
    const query = new Packet();
    query.header.id = crypto.randomInt(0x10000);
    // see https://github.com/song940/node-dns/issues/29
    if (recursive) {
      query.header.rd = 1;
    }
    if (clientIp) {
      query.additionals.push(
        Packet.Resource.EDNS([Packet.Resource.EDNS.ECS(clientIp)]),
      );
    }
    query.questions.push({
      name,
      class: cls,
      type: Packet.TYPE[type],
    });
    const client = new udp.Socket(socketType);
    // Only enforce a strict source-address check when `dns` is an IP literal;
    // hostnames would require an extra resolve to compare against.
    const expectedAddress = net.isIP(dns) ? dns : null;
    return new Promise((resolve, reject) => {
      let settled = false;
      let timer;
      const cleanup = () => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        client.removeListener('message', onMessage);
        client.removeListener('error', onError);
        try {
          client.close();
        } catch (_) {
          /* already closed */
        }
      };
      function onMessage(message, rinfo) {
        // Drop packets that didn't come from the configured resolver.
        if (
          rinfo.port !== port ||
          (expectedAddress && rinfo.address !== expectedAddress)
        ) {
          debug(
            'udp: dropping packet from unexpected sender %s:%d',
            rinfo.address,
            rinfo.port,
          );
          return;
        }
        let response;
        try {
          response = Packet.parse(message);
        } catch (e) {
          debug('udp: dropping unparseable packet: %s', e.message);
          return;
        }
        // Stray / late reply from a reused ephemeral port — keep listening.
        if (response.header.id !== query.header.id) {
          debug(
            'udp: dropping response with mismatched id %d (expected %d)',
            response.header.id,
            query.header.id,
          );
          return;
        }
        // RFC 1035 §4.2.1: if the TC (truncated) bit is set the upstream had
        // more data than fits in a 512-byte UDP datagram.  Retry over TCP so
        // callers always receive a complete answer.
        if (response.header.tc && retryOverTCP) {
          debug('udp: TC bit set — retrying query over TCP');
          cleanup();
          const TCPClient = require('./tcp');
          resolve(TCPClient({ dns, port })(name, type, cls, options));
          return;
        }
        cleanup();
        resolve(response);
      }
      function onError(err) {
        cleanup();
        reject(err);
      }
      client.on('message', onMessage);
      client.on('error', onError);

      if (timeout > 0) {
        timer = setTimeout(() => {
          cleanup();
          const err = new Error(`DNS query timed out after ${timeout}ms`);
          err.code = 'ETIMEDOUT';
          reject(err);
        }, timeout);
        timer.unref();
      }

      debug('send', dns, query.toBuffer());
      client.send(query.toBuffer(), port, dns, err => {
        if (err) {
          cleanup();
          reject(err);
        }
      });
    });
  };
};
