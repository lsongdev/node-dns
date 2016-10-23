const dns = require('../');

var server = dns.createServer(function(req){
  
  var response = new dns.Response(req);
  
  this.send(response);
  
}).listen(5354);