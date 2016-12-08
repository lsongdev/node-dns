const assert = require('assert')
const DNS = require('../');

var dns = new DNS({
  servers: '114.114.114.114'
});

dns.lookup('lsong.org', function(err, res){
  console.log(res);
});