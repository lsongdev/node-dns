const tcp = require('net');
const Packet = require('../packet');

module.exports = ({ dns = '1.1.1.1', port = 53 } = {}) => {
  return async(name, type = 'A', cls = Packet.CLASS.IN, { clientIp, recursive = true } = {}) => {
    const packet = new Packet();

    // see https://github.com/song940/node-dns/issues/29
    if (recursive) {
      packet.header.rd = 1;
    }
    if (clientIp) {
      packet.additionals.push(Packet.Resource.EDNS([
        Packet.Resource.EDNS.ECS(clientIp),
      ]));
    }

    packet.questions.push({
      name,
      class : cls,
      type  : Packet.TYPE[type],
    });
    const message = packet.toBuffer();
    const len = Buffer.alloc(2);
    len.writeUInt16BE(message.length);
    const client = tcp.connect({ host: dns, port });
    client.end(Buffer.concat([ len, message ]));
    const data = await Packet.readStream(client);
    if (!data.length) {
      throw new Error('Empty TCP response');
    }
    return Packet.parse(data);
  };
};
