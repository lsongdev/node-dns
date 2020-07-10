const tcp = require('net');
const Packet = require('../packet');

module.exports = ({ dns = '1.1.1.1', port = 53 } = {}) => {
  return async (name, type = 'A', cls = Packet.CLASS.IN) => {
    const packet = new Packet();
    packet.questions.push({
      name,
      class: cls,
      type: Packet.TYPE[type],
    });
    const message = packet.toBuffer();
    const len = Buffer.alloc(2);
    len.writeUInt16BE(message.length);
    const client = tcp.connect({ host: dns, port });
    client.end(Buffer.concat([len, message]));
    const data = await Packet.readStream(client);
    return Packet.parse(data);
  }
};