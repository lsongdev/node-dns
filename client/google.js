const https = require('https');

const get = url => new Promise(resolve =>
  https.get(url, resolve));

const readStream = stream => {
  const buffer = [];
  return new Promise((resolve, reject) => {
    stream
      .on('error', reject)
      .on('data', chunk => {
        buffer.push(chunk);
      })
      .on('end', () => resolve(Buffer.concat(buffer)));
  });
};

const GoogleClient = () =>
  (name, type = 'ANY') => {
    return Promise
      .resolve()
      .then(() => get(`https://dns.google.com/resolve?name=${name}&type=${type}`))
      .then(readStream)
      .then(JSON.parse);
  };

module.exports = GoogleClient;
