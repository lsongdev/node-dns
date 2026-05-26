const http = require('node:http');
const https = require('node:https');
const { URL } = require('node:url');
const Packet = require('../packet');
const EventEmitter = require('node:events');
const { debuglog } = require('node:util');

const debug = debuglog('dns2-server');

const decodeBase64URL = str => {
  let queryData = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = queryData.length % 4;
  if (pad === 1) return;
  if (pad) {
    queryData += new Array(5 - pad).join('=');
  }
  return queryData;
};

const readStream = stream =>
  new Promise((resolve, reject) => {
    const chunks = [];
    stream
      .on('error', reject)
      .on('data', chunk => chunks.push(chunk))
      .on('end', () => resolve(Buffer.concat(chunks)));
  });

// RFC 8484 §4.1 — accept the request unless the client explicitly asked for
// media types that exclude application/dns-message.
//
// Per RFC 7231 §5.3.1 a q parameter of 0 means "not acceptable", so an entry
// like "application/dns-message;q=0" is an explicit rejection even though
// the media range matches. Parse q and treat q=0 as absent for matching;
// only if no surviving entry matches do we reject the request.
const parseAccept = accept =>
  accept.split(',').map(entry => {
    const parts = entry.split(';').map(s => s.trim());
    const type = (parts.shift() || '').toLowerCase();
    let q = 1;
    for (const param of parts) {
      const [name, value] = param.split('=').map(s => s.trim());
      if (name && name.toLowerCase() === 'q') {
        const parsed = parseFloat(value);
        if (Number.isFinite(parsed)) q = parsed;
      }
    }
    return { type, q };
  });

const isAcceptable = accept => {
  if (!accept) return true;
  return parseAccept(accept).some(
    ({ type, q }) =>
      q > 0 &&
      (type === '*/*' ||
        type === 'application/*' ||
        type === 'application/dns-message'),
  );
};

// RFC 8484 §5.1 — DoH responses SHOULD include Cache-Control: max-age=<TTL>
// derived from the minimum TTL across all RRs the response carries. A response
// with no RRs (NXDOMAIN, etc.) gets max-age=0.
//
// The OPT pseudo-RR (RFC 6891) reuses the TTL field for flags / extended
// RCODE and is typically 0; including it would force max-age=0 on any
// otherwise-cacheable EDNS response. Skip OPT (and any future pseudo-RR
// whose TTL field is not a real TTL).
const minResponseTtl = packet => {
  let min = Infinity;
  for (const section of [
    packet.answers,
    packet.authorities,
    packet.additionals,
  ]) {
    if (!section) continue;
    for (const rr of section) {
      if (!rr || typeof rr.ttl !== 'number') continue;
      if (rr.type === Packet.TYPE.EDNS) continue;
      if (rr.ttl < min) min = rr.ttl;
    }
  }
  if (!Number.isFinite(min) || min < 0) return 0;
  return Math.min(min >>> 0, 0x7fffffff);
};

class Server extends EventEmitter {
  constructor(options) {
    super();
    const { ssl } = Object.assign(this, { cors: true }, options);
    this.server = (ssl ? https.createServer(options) : http.createServer())
      .on('request', this.handleRequest.bind(this))
      .on('listening', () => this.emit('listening', this.address()))
      .on('error', error => this.emit('error', error))
      .on('close', () => {
        this.server.removeAllListeners();
        this.emit('close');
      });
    return this;
  }

  async handleRequest(client, res) {
    try {
      const { method, url, headers } = client;
      const { pathname, searchParams: query } = new URL(url, 'http://unused/');
      const { cors } = this;
      if (cors === true) {
        res.setHeader('Access-Control-Allow-Origin', '*');
      } else if (typeof cors === 'string') {
        res.setHeader('Access-Control-Allow-Origin', cors);
        res.setHeader('Vary', 'Origin');
      } else if (typeof cors === 'function') {
        const isAllowed = cors(headers.origin);
        res.setHeader(
          'Access-Control-Allow-Origin',
          isAllowed ? headers.origin : 'false',
        );
        res.setHeader('Vary', 'Origin');
      }
      // debug
      debug('request', method, url);
      // We are only handling get and post as reqired by rfc
      if (method !== 'GET' && method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'text/plain' });
        res.write('405 Method not allowed\n');
        res.end();
        return;
      }
      // Check so the uri is correct
      if (pathname !== '/dns-query') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.write('404 Not Found\n');
        res.end();
        return;
      }
      // RFC 8484 §4.1: clients SHOULD send Accept: application/dns-message but
      // are not required to, and the server is not required to reject other
      // values. Only reject when the client sent a specific, incompatible
      // Accept that excludes application/dns-message; treat missing, "*/*",
      // and "application/*" as acceptable. The server always replies with
      // application/dns-message regardless.
      if (!isAcceptable(headers.accept)) {
        res.writeHead(406, { 'Content-Type': 'text/plain' });
        res.write('406 Not Acceptable: application/dns-message required\n');
        res.end();
        return;
      }
      let queryData;
      if (method === 'GET') {
        // Parse query string for the request data
        const dns = query.get('dns');
        if (!dns) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.write('400 Bad Request: No query defined\n');
          res.end();
          return;
        }
        // Decode from Base64Url Encoding
        const base64 = decodeBase64URL(dns);
        if (!base64) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.write('400 Bad Request: Invalid query data\n');
          res.end();
          return;
        }
        // Decode Base64 to buffer
        queryData = Buffer.from(base64, 'base64');
      } else if (method === 'POST') {
        // RFC 8484 §4.1: POST request bodies have Content-Type:
        // application/dns-message. Anything else is unsupported.
        const ct = (headers['content-type'] || '')
          .split(';')[0]
          .trim()
          .toLowerCase();
        if (ct !== 'application/dns-message') {
          res.writeHead(415, { 'Content-Type': 'text/plain' });
          res.write(
            '415 Unsupported Media Type: expected application/dns-message\n',
          );
          res.end();
          return;
        }
        queryData = await readStream(client);
      }
      // Parse DNS query and Raise event.
      const message = Packet.parse(queryData);
      this.emit('request', message, this.response.bind(this, res), client);
    } catch (e) {
      this.emit('requestError', e);
      res.destroy();
    }
  }

  /**
   * Send of the response to the client
   * @param {*} res
   * @param {*} message
   */
  response(res, message) {
    debug('response');
    res.setHeader('Content-Type', 'application/dns-message');
    // RFC 8484 §5.1 — Cache-Control derived from the minimum RR TTL so HTTP
    // intermediaries expire the cached response when the DNS data does.
    res.setHeader('Cache-Control', `max-age=${minResponseTtl(message)}`);
    res.writeHead(200);
    res.end(message.toBuffer());
  }

  /**
   * listen
   * @param {*} port
   * @returns
   */
  listen(port, address) {
    return this.server.listen(port || this.port, address);
  }

  address() {
    return this.server.address();
  }

  close() {
    this.server.closeIdleConnections();
    return this.server.close();
  }
}

module.exports = Server;
