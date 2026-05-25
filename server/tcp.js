const tcp = require('node:net');
const Packet = require('../packet');
const proxyProtocol = require('../lib/proxy-protocol');

class Server extends tcp.Server {
  constructor(options) {
    super();
    let proxyProtocolEnabled = false;
    if (typeof options === 'object' && options !== null) {
      proxyProtocolEnabled = options.proxyProtocol ?? false;
    }
    if (typeof options === 'function') {
      this.on('request', options);
    }
    this.proxyProtocol = proxyProtocolEnabled;
    this.on('connection', this.handle.bind(this));
  }

  async handle(client) {
    try {
      if (this.proxyProtocol) {
        const header = await consumeProxyHeader(client);
        client.proxy = header;
        if (header.command === 'PROXY') {
          client.proxyAddress = header.sourceAddress;
          client.proxyPort = header.sourcePort;
        }
      }
      const data = await Packet.readStream(client);
      const message = Packet.parse(data);
      this.emit('request', message, this.response.bind(this, client), client);
    } catch (e) {
      this.emit('requestError', e);
      client.destroy();
    }
  }

  response(client, message) {
    if (message instanceof Packet) {
      message = message.toBuffer();
    }
    const len = Buffer.alloc(2);
    len.writeUInt16BE(message.length);
    client.end(Buffer.concat([ len, message ]));
  }
}

// Read and consume the PROXY header from the front of the socket's stream.
// Any bytes that arrive past the header are unshifted back into the socket
// so the next reader (Packet.readStream) sees them.
function consumeProxyHeader(socket) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let chunklen = 0;
    let done = false;

    const cleanup = () => {
      socket.removeListener('readable', onReadable);
      socket.removeListener('end', onEnd);
      socket.removeListener('error', onError);
    };
    const onError = err => {
      if (done) return;
      done = true;
      cleanup();
      reject(err);
    };
    const onEnd = () => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error('PROXY protocol: stream ended before header complete'));
    };
    const onReadable = () => {
      if (done) return;
      let chunk;
      while ((chunk = socket.read()) !== null) {
        chunks.push(chunk);
        chunklen += chunk.length;
      }
      if (chunklen === 0) return;
      const buffer = Buffer.concat(chunks, chunklen);
      let parsed;
      try {
        parsed = proxyProtocol.parse(buffer);
      } catch (e) {
        return onError(e);
      }
      if (!parsed) return;
      done = true;
      cleanup();
      const leftover = buffer.slice(parsed.headerLength);
      if (leftover.length) socket.unshift(leftover);
      resolve(parsed.header);
    };

    socket.on('readable', onReadable);
    socket.on('end', onEnd);
    socket.on('error', onError);
    // Drain anything already buffered before our 'readable' listener attached.
    onReadable();
  });
}

module.exports = Server;
