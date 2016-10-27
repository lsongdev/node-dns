const dns = require('../');

var server = dns.createServer(function(req){
  
  var response = new dns.Packet(req);
  
  // response.answer.push({ 
  //   name: 'www.z.cn.', 
  //   type: 1,
  //   class: 1
  // });

  this.send(response);
  
}).listen(5354);
