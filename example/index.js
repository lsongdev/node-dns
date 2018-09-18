const DNS = require('..');

const dns = new DNS();

// const query = new DNS.Packet();
// query.questions.push({
//   name : 'lsong.org',
//   type : DNS.Packet.TYPE.ANY,
//   class: DNS.Packet.CLASS.IN
// });

dns.query('test.lsong.org', function(err, res){
  console.log(err, res);
});
