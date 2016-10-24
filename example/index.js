
const dns = require('../');

var req = new dns.Request();
console.log(new Buffer(req.serializeDomainName('z.cn')));

// dns.query('lsong.org', function(err, res){
//   console.log(res);
// });
