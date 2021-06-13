const udp = require('dgram');
const Packet = require('../packet');
const { equal } = require('assert');
const { debuglog } = require('util');

const debug = debuglog('dns2');

module.exports = ({ dns = '8.8.8.8', port = 53, socketType = 'udp4' } = {}) => {
  return (name, type = 'A', cls = Packet.CLASS.IN, { clientIp, recursive = true } = {}) => {
    const query = new Packet();
    query.header.id = (Math.random() * 1e4) | 0;

    // see https://github.com/song940/node-dns/issues/29
    if (recursive) {
      query.header.rd = 1;
    }
    if (clientIp) {
      query.additionals.push(Packet.Resource.EDNS([
        Packet.Resource.EDNS.ECS(clientIp),
      ]));
    }
    query.questions.push({
      name,
      class : cls,
      type  : Packet.TYPE[type],
    });
    const client = new udp.Socket(socketType);
    return new Promise((resolve, reject) => {
      client.once('message', function onMessage(message) {
        client.close();
        const response = Packet.parse(message);
        equal(response.header.id, query.header.id);
        resolve(response);
      });
      debug('send', dns, query.toBuffer());
      client.send(query.toBuffer(), port, dns, err => err && reject(err));
    });
  };
};
