const https = require('https');
const Packet = require('../packet');

const get = url => new Promise(resolve => {
  const headers = {
    accept: 'application/dns-message',
  };
  https.get(url, { headers }, resolve);
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
const DOHClient = ({ dns } = {}) => {
  return (name, type = 'A', cls = Packet.CLASS.IN, { clientIp, recursive = true } = {}) => {
    const packet = new Packet();
    // see https://github.com/song940/node-dns/issues/29
    if (recursive) {
      packet.header.rd = 1;
    }
    packet.questions.push({
      name,
      class : cls,
      type  : Packet.TYPE[type],
    });
    const query = packet.toBase64URL();
    if (clientIp) {
      query.additionals.push(Packet.Resource.EDNS([
        Packet.Resource.EDNS.ECS(clientIp),
      ]));
    }
    return Promise
      .resolve()
      .then(() => get(`https://${dns}/dns-query?dns=${query}`))
      .then(readStream)
      .then(Packet.parse);
  };
};

module.exports = DOHClient;
