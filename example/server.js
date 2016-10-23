const dns = require('../');

var server = dns.createServer(function(req){
  
  console.log(req);
  
}).listen(5354);