const dgram  = require('dgram');
const Packet = require('../packet');

var socket = dgram.createSocket('udp4')

socket.on('message', function (message, rinfo) {
  console.log(rinfo)
  console.log(Packet.parse(message))
});

var packet = new Packet({ id: 1 });

packet.questions.push({
  name : 'google.com',
  type : Packet.TYPE.A,
  class: Packet.CLASS.IN
});

var buf = packet.toBuffer();
socket.send(buf, 0, buf.length, 53, '8.8.8.8')