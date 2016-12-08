const assert = require('assert')
const DNS = require('../');

var dns = new DNS({
  // servers: '114.114.114.114'
});


dns.lookup('google.com', function(err, res){
  console.log(res);
});