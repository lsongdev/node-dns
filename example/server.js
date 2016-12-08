const udp    = require('dgram');
const dns    = require('../');
const Packet = require('../packet');

var server = dns.createServer(function(request, send){

  response = send;
  var socket = udp.createSocket('udp4');
  socket.on('message', function (message, rinfo) {
    var response = Packet.parse(message);
    console.log(response);
    send(message);
  });
  var buf = request.toBuffer();
  socket.send(buf, 0, buf.length, 53, '8.8.8.8')
  
  // var response = new dns.Packet(request);
  // response.header.qr = 1;

  // response.answers.push({
  //   name : 'lsong.org',
  //   type : dns.Packet.TYPE.A,
  //   class: dns.Packet.CLASS.IN,
  //   address: '127.0.0.1'
  // });

  // send(response);
  
}).listen(53);








// var packet = new Packet({ id: 1 });

// packet.questions.push({
//   name : 'google.com',
//   type : Packet.TYPE.A,
//   class: Packet.CLASS.IN
// });



