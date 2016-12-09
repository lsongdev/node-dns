const assert = require('assert')
const DNS = require('../');

var dns = new DNS({
  servers: '114.114.114.114'
  // servers: 'a.root-servers.net'
});

dns.lookup('twitter.com', function(err, res){
  console.log(res);
});