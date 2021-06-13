const DNS = require('../..');

// Lookup directly from ns1.google.com
const dns = new DNS({ nameServers: [ '216.239.32.10' ] });

(async() => {
  // What is the IP address for google.com if a client in the subnet
  // '178.67.222.0/24' asks for it?
  const result = await dns.resolveA('google.com', '178.67.222.0/24');
  console.log(result.answers);
})();
