## DNS2

> A dns server and client implementation

```js
const dns = require('dns2');

dns.query('lsong.org', function(err, res){
  console.log(res);
});


var server = dns.createServer(function(req, res){
  
  //
  res.reply('10.10.10.10');

}).listen(5353);

```