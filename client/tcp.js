const tls = require('tls');
const tcp = require('net');
const Packet = require('../packet');

const makeQuery = ({ name, type = 'A', cls = Packet.CLASS.IN, clientIp, recursive = true }) => {
  const packet = new Packet();
  packet.header.rd = recursive ? 1 : 0;

  if (clientIp) {
    packet.additionals.push(Packet.Resource.EDNS([
      Packet.Resource.EDNS.ECS(clientIp),
    ]));
  }

  packet.questions.push({ name, class: cls, type: Packet.TYPE[type] });
  return packet.toBuffer();
};

const sendQuery = (client, message) => {
  const len = Buffer.alloc(2);
  len.writeUInt16BE(message.length);
  client.write(Buffer.concat([ len, message ]));
};

const protocols = {
  'tcp:' : (host, port) => tcp.connect({ host, port }),
  'tls:' : (host, port) => tls.connect({ host, port, servername: host }),
};

const TCPClient = ({ dns, protocol = 'tcp:', port = protocol === 'tls:' ? 853 : 53 } = {}) => {
  if (!protocols[protocol]) {
    throw new Error('Protocol must be tcp: or tls:');
  }

  return async(name, type, cls, options = {}) => {
    const message = makeQuery({ name, type, cls, ...options });
    const [ host ] = dns.split(':');
    const client = protocols[protocol](host, port);

    sendQuery(client, message);
    const data = await Packet.readStream(client);
    client.end();

    if (!data.length) throw new Error('Empty response');
    return Packet.parse(data);
  };
};

module.exports = TCPClient;
