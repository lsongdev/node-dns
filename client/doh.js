const Packet = require('../packet');

const defaultGet = url => new Promise((resolve, reject) => {
  const headers = {
    accept: 'application/dns-message',
  };
  const base = url.startsWith('https') ? require('https') : require('http');
  const req = base.get(url, { headers }, resolve);
  req.on('error', reject);
});

const readStream = stream => {
  const buffer = [];
  return new Promise((resolve, reject) => {
    stream
      .on('error', reject)
      .on('data', chunk => buffer.push(chunk))
      .on('end', () => resolve(Buffer.concat(buffer)));
  });
};

/**
 * @docs https://tools.ietf.org/html/rfc8484
 * @param {*} param0
 */
const DOHClient = ({ dns, http, get = defaultGet } = {}) => {
  return (name, type = 'A', cls = Packet.CLASS.IN, { clientIp, recursive = true } = {}) => {
    const packet = new Packet();
    // see https://github.com/song940/node-dns/issues/29
    if (recursive) {
      packet.header.rd = 1;
    }
    if (clientIp) {
      packet.additionals.push(Packet.Resource.EDNS([
        Packet.Resource.EDNS.ECS(clientIp),
      ]));
    }
    packet.questions.push({
      name,
      class : cls,
      type  : Packet.TYPE[type],
    });
    const query = packet.toBase64URL();
    return Promise.resolve(get(`http${http ? '' : 's'}://${dns}/dns-query?dns=${query}`))
      .then(readStream)
      .then(Packet.parse);
  };
};

module.exports = DOHClient;
