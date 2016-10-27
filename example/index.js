const assert = require('assert')
const dns = require('../');

dns.lookup('com', function(err, res){
  console.log(res);
});
