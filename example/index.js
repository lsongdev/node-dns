const assert = require('assert')
const dns = require('../');

dns.lookup('lsong.org', function(err, res){
  console.log(res);
});
