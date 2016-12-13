const udp    = require('dgram');
const dns    = require('../');
const Packet = require('../packet');

var server = dns.createServer(function(request, send){

  var response = new dns.Packet(request);
  //
  response.header.qr = 1;
  response.answers.push({
    name : 'lsong.org',
    type : dns.Packet.TYPE.A,
    class: dns.Packet.CLASS.IN,
    address: '127.0.0.1'
  });
  
  response.answers.push({
    name : 'lsong.org',
    type : dns.Packet.TYPE.AAAA,
    class: dns.Packet.CLASS.IN,
    address: '2001:0db8:0000:0000:0000:ff00:0042:8329'
  });
  
  response.answers.push({
    name : 'lsong.org',
    type : dns.Packet.TYPE.CNAME,
    class: dns.Packet.CLASS.IN,
    domain: 'sfo1.lsong.org'
  });
  
  response.authorities.push({
    name : 'lsong.org',
    type : dns.Packet.TYPE.MX,
    class: dns.Packet.CLASS.IN,
    ttl: 300,
    exchange: 'mail.lsong.org',
    priority: 5
  });
  
  response.authorities.push({
    name : 'lsong.org',
    type : dns.Packet.TYPE.NS,
    class: dns.Packet.CLASS.IN,
    ttl: 300,
    ns: 'ns1.lsong.org',
  });
  
  response.additionals.push({
    name : 'lsong.org',
    type : dns.Packet.TYPE.SOA,
    class: dns.Packet.CLASS.IN,
    ttl: 300,
    primary: 'lsong.org',
    admin: 'admin@lsong.org',
    serial: 2016121301,
    refresh: 300,
    retry: 3,
    expiration: 10,
    minimum: 10
  });
  // 
  response.additionals.push({
    name : 'lsong.org',
    type : dns.Packet.TYPE.TXT,
    class: dns.Packet.CLASS.IN,
    ttl: 300,
    data: 'hello world'
  });
  
  send(response);
  
}).listen(5354);