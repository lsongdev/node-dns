const http = require('http');
const https = require('https');
const { URL } = require('url');
const Packet = require('../packet');
const EventEmitter = require('events');
const { debuglog } = require('util');

const debug = debuglog('dns2-server');

const decodeBase64URL = str => {
  let queryData = str
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const pad = queryData.length % 4;
  if (pad === 1) return;
  if (pad) {
    queryData += new Array(5 - pad).join('=');
  }
  return queryData;
};

const readStream = stream => new Promise((resolve, reject) => {
  let buffer = '';
  stream
    .on('error', reject)
    .on('data', chunk => { buffer += chunk; })
    .on('end', () => resolve(buffer));
});

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
        res.setHeader('Access-Control-Allow-Origin', isAllowed ? headers.origin : 'false');
        res.setHeader('Vary', 'Origin');
      }
      // debug
      debug('request', method, url);
      // We are only handling get and post as reqired by rfc
      if ((method !== 'GET' && method !== 'POST')) {
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
      // Make sure the requestee is requesting the correct content type
      const contentType = headers.accept;
      if (contentType !== 'application/dns-message') {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.write('400 Bad Request: Illegal content type\n');
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
    return this.server.close();
  }
}

module.exports = Server;
