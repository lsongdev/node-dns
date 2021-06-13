const DNS = require('../..');

const dns = new DNS();

(async() => {
  const result = await dns.resolveA('google.com');
  console.log(result.answers);
})();
