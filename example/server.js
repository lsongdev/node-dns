const dns = require('../');

var server = dns.createServer(function(req, send){
  
  console.log(req);
  var response = new dns.Packet();
  send(response);
  
}).listen(5354);
