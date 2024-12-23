const http = require('http');
const https = require('https');
const http2 = require('http2');
const Packet = require('../packet');

const protocols = {
  'http:'  : http.get,
  'https:' : https.get,
  'h2:'    : (url, options, done) => {
    const urlObj = new URL(url);
    const client = http2.connect(url.replace('h2:', 'https:'));
    const req = client.request({
      ':path'   : `${urlObj.pathname}${urlObj.search}`,
      ':method' : 'GET',
      ...options.headers,
    });

    req.on('response', headers => {
      client.close();
      done({
        headers,
        statusCode : headers[':status'],
        on         : req.on.bind(req),
      });
    });

    req.on('error', err => {
      client.close();
      throw err;
    });

    req.end();
  },
};

const makeRequest = (url, query) => new Promise((resolve, reject) => {
  const index = url.indexOf('://');
  if (index === -1) url = `https://${url}`;
  const u = new URL(url);
  const get = protocols[u.protocol];
  if (!get) throw new Error(`Unsupported protocol: ${u.protocol}, must be specified (http://, https:// or h2://)`);
  if (!u.pathname) url += '/dns-query?dns={query}';
  url = url.replace('{query}', query);
  const req = get(url, { headers: { accept: 'application/dns-message' } }, resolve);
  if (req) req.on('error', reject);
});

const readStream = res => new Promise((resolve, reject) => {
  const chunks = [];
  res
    .on('error', reject)
    .on('data', chunk => chunks.push(chunk))
    .on('end', () => {
      const data = Buffer.concat(chunks);
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: ${data.toString()}`));
      }
      resolve(data);
    });
});

const buildQuery = ({ name, type = 'A', cls = Packet.CLASS.IN, clientIp, recursive = true }) => {
  const packet = new Packet();
  packet.header.rd = recursive ? 1 : 0;

  if (clientIp) {
    packet.additionals.push(Packet.Resource.EDNS([
      Packet.Resource.EDNS.ECS(clientIp),
    ]));
  }

  packet.questions.push({ name, class: cls, type: Packet.TYPE[type] });
  return packet.toBase64URL();
};

const DOHClient = ({ dns }) => {
  return async(name, type, cls, options = {}) => {
    const query = buildQuery({ name, type, cls, ...options });
    const response = await makeRequest(dns, query);
    const data = await readStream(response);
    return Packet.parse(data);
  };
};

module.exports = DOHClient;
