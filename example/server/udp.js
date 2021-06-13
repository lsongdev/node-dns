const dns = require('../..');

const { Packet } = dns;

const server = dns.createUDPServer((request, send, rinfo) => {
  const response = Packet.createResponseFromRequest(request);
  const [ question ] = request.questions;
  const { name } = question;
  response.answers.push({
    name,
    type    : Packet.TYPE.A,
    class   : Packet.CLASS.IN,
    ttl     : 300,
    address : '8.8.8.8',
  });
  send(response);
});

server.on('request', (request, response, rinfo) => {
  console.log(request.header.id, request.questions[0]);
});

server.listen(5333);
