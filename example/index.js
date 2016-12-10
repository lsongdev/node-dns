const assert = require('assert')
const DNS    = require('..');

var dns = new DNS({
  // servers: '114.114.114.114'
});

var question = new DNS.Packet.Question({
  name : 'lsong.org',
  type : DNS.Packet.TYPE.ANY,
  class: DNS.Packet.CLASS.IN
})

dns.lookup(question, function(err, res){
  // console.log(res);
});