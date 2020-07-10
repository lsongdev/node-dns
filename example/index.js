const DNS = require('..');

const dns = new DNS();

(async () => {
  const result = await dns.resolve('google.com');
  console.log(result.answers);
})();