const assert = require('assert')
const DNS    = require('..');

var dns = new DNS();

var packet = new DNS.Packet();

packet.questions.push({
  name : 'lsong.org',
  type : DNS.Packet.TYPE.ANY,
  class: DNS.Packet.CLASS.IN
});

dns.send(packet, function(err, res){
  console.log(err, res);
});