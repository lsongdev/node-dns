const dns = require('..');
const path = require('path');
const fs = require('fs');

const { Packet } = dns;

// Create a SSL enabled server
const server = dns.createDOHServer({
    port: 0,
    sslport: 443,
    cert: fs.readFileSync(path.join(__dirname,"server.crt")),
    key: fs.readFileSync(path.join(__dirname,"secret.key"))  
});

//Handle the incomming request (same style as both UDP and TCP server)
server.on('request', (request, send, client) => {
    const response = Packet.createResponseFromRequest(request);
    const [ question ] = request.questions;
    const { name } = question;
    response.answers.push({
      name,
      type: Packet.TYPE.A,
      class: Packet.CLASS.IN,
      ttl: 300,
      address: '8.8.8.8'
    });
    send(response);
  });
