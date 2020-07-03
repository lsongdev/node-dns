const dns = require('..');

const { Packet } = dns;

const server = dns.createServer(function(request, send) {
  const response = Packet.createResponseFromRequest(request);
  const answer = new Packet.createResourceFromQuestion(request.questions[0], {
    target: 'hermes2.jabber.org',
    port: 8080,
    weight: 30,
    priority: 30
  });
  response.answers.push(answer);
  send(response);
}).listen(5333);