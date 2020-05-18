const DNS = require('..');

const dns = new DNS();

(async () => {
  const result = await dns.resolveA('baidu.com')
  console.log(result);
})();