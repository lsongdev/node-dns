const dns = require('../');

var server = dns.createServer(function(req){
  
  console.log(req);
  
  // var response = new dns.Response(req);
  
  // this.send(response);
  
}).listen(5354);
