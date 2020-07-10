const https = require('https');
const Packet = require('../packet');

const get = url => new Promise(resolve => {
  const headers = {
    accept: 'application/dns-message'
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
  })
};

/**
 * @docs https://tools.ietf.org/html/rfc8484
 * @param {*} param0 
 */
const DoH = ({ dns } = {}) => {
  return (name, type = 'A', cls = Packet.CLASS.IN) => {
    const packet = new Packet();
    packet.questions.push({
      name,
      class: cls,
      type: Packet.TYPE[type],
    });
    const query = packet.toBase64URL();
    return Promise
      .resolve()
      .then(() => get(`https://${dns}/dns-query?dns=${query}`))
      .then(readStream)
      .then(Packet.parse)
  };
};

module.exports = DoH;