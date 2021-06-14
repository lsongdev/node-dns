const dns = require('../..');
const path = require('path');
const fs = require('fs');

const { Packet } = dns;

// Create a SSL enabled server
const server = dns.createServer({
  udp : true,
  tcp : true,
  doh : {
    ssl  : true,
    cert : fs.readFileSync(path.join(__dirname, 'server.crt')),
    key  : fs.readFileSync(path.join(__dirname, 'secret.key')),
  },
});

// Handle the incomming request (same style as both UDP and TCP server)
server.on('request', (request, send, client) => {
  const response = Packet.createResponseFromRequest(request);
  const [ question ] = request.questions;
  const { name } = question;
  response.answers.push({
    name,
    type    : Packet.TYPE.A,
    class   : Packet.CLASS.IN,
    ttl     : 300,
    address : '1.1.1.1',
  });
  send(response);
});

(async() => {
  const closed = new Promise(resolve => process.on('SIGINT', resolve));
  await server.listen({
    doh : 8443,
    udp : 5333,
    tcp : 5334,
  });
  console.log('Listening.');
  console.log(server.addresses());
  await closed;
  process.stdout.write('\n');
  await server.close();
  console.log('Closed.');
})();
