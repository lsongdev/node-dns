const dns = require('dns');
const { UDPClient } = require('../..');

const resolve = UDPClient({
  dns: dns.getServers()[0],
});

(async() => {
  const response = await resolve('google.com');
  console.log(response.answers);
})();
