const dns = require('../');

var server = dns.createServer(function(request, send){
  
  var response = new dns.Packet(request);
  
  response.header.qr = 1;

  var answer = new dns.Packet.Resource.A('127.0.0.1');
  answer.name = 'lsong.org';
  response.answers.push(answer);
  send(response);
  
}).listen(5354);
