const dns = require('../..');

const { Packet } = dns;

const server = dns.createTCPServer();

server.on('request', (request, send, client) => {
  const response = Packet.createResponseFromRequest(request);
  const answer = Packet.createResourceFromQuestion(request.questions[0], {
    target   : 'hermes2.jabber.org',
    port     : 8080,
    weight   : 30,
    priority : 30,
  });
  response.answers.push(answer);
  send(response);
});

server.listen(5333);
