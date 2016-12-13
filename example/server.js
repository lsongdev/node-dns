const udp    = require('dgram');
const dns    = require('../');
const Packet = require('../packet');


var hosts = {
  'weibo.com': '127.0.0.1',
  'www.facebook.com': '127.0.0.1',
  'twitter.com': '127.0.0.1',
  'google.com': '127.0.0.1',
};

var server = dns.createServer(function(request, send){
  
  var query = request.questions[0].name;
  
  console.log('> request %s', query);
  
  if(hosts[query]){
    var response = new Packet(request);
    response.header.qr = 1;
    response.header.ra = 1;
    response.answers.push({
      name: query,
      type: Packet.TYPE.A,
      class: Packet.CLASS.IN,
      ttl: 300,
      address: hosts[ query ]
    });
    send(response);
  }else{
    var socket = udp.createSocket('udp4');

    socket.on('message', function (message, rinfo) {
      var response = Packet.parse(message);
      console.log(response);
      send(response);
    });

    var buf = request.toBuffer();
    socket.send(buf, 0, buf.length, 53, '8.8.8.8');
  }
  
}).listen(53);