const tcp = require('node:net');
const Packet = require('../packet');
const proxyProtocol = require('../lib/proxy-protocol');

// RFC 7766 §6.2.3 — recommended minimum idle timeout for established TCP
// connections. Clients that pipeline queries on a single connection rely on
// the server holding the connection open between messages.
const DEFAULT_IDLE_TIMEOUT_MS = 10000;

class Server extends tcp.Server {
  constructor(options) {
    super();
    let proxyProtocolEnabled = false;
    let idleTimeout = DEFAULT_IDLE_TIMEOUT_MS;
    if (typeof options === 'object' && options !== null) {
      proxyProtocolEnabled = options.proxyProtocol ?? false;
      if (typeof options.idleTimeout === 'number') idleTimeout = options.idleTimeout;
    }
    if (typeof options === 'function') {
      this.on('request', options);
    }
    this.proxyProtocol = proxyProtocolEnabled;
    this.idleTimeout = idleTimeout;
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
      // RFC 7766 §6.2.1.1 — process pipelined queries on a single connection.
      // Each message is length-prefixed (RFC 1035 §4.2.2). The connection
      // stays open until the client sends FIN, an error occurs, or the
      // idle timeout fires.
      if (this.idleTimeout > 0) client.setTimeout(this.idleTimeout);
      readPipelinedMessages(client, data => {
        try {
          const message = Packet.parse(data);
          this.emit('request', message, this.response.bind(this, client), client);
        } catch (e) {
          this.emit('requestError', e);
          client.destroy();
        }
      }, err => {
        this.emit('requestError', err);
        client.destroy();
      });
    } catch (e) {
      this.emit('requestError', e);
      client.destroy();
    }
  }

  response(client, message) {
    if (message instanceof Packet) {
      message = message.toBuffer();
    }
    // Out-of-order replies are permitted (RFC 7766 §6.2.4) and identified by
    // the transaction ID in the message header. Each reply is length-prefixed
    // and written without closing the connection so pipelined queries can
    // continue to use it.
    const len = Buffer.alloc(2);
    len.writeUInt16BE(message.length);
    if (!client.destroyed && client.writable) {
      client.write(Buffer.concat([ len, message ]));
    }
  }
}

// Drive a single TCP connection: read each length-prefixed DNS message in
// turn and invoke onMessage(buffer) for each. End cleanly when the client
// half-closes; surface protocol errors through onError. Connection lifetime
// is managed by the caller (idleTimeout, etc.).
function readPipelinedMessages(socket, onMessage, onError) {
  let buffered = Buffer.alloc(0);
  let expected = null;

  const drain = () => {
    while (true) {
      if (expected === null) {
        if (buffered.length < 2) return;
        expected = buffered.readUInt16BE(0);
        buffered = buffered.slice(2);
      }
      if (buffered.length < expected) return;
      const message = buffered.slice(0, expected);
      buffered = buffered.slice(expected);
      expected = null;
      onMessage(message);
    }
  };

  const onReadable = () => {
    let chunk;
    while ((chunk = socket.read()) !== null) {
      buffered = buffered.length === 0 ? chunk : Buffer.concat([ buffered, chunk ]);
    }
    try { drain(); } catch (e) { onError(e); }
  };

  socket.on('readable', onReadable);
  socket.on('end', () => {
    // Half-close from the peer ends the message stream. If there's a partial
    // message still in the buffer, that's a framing error.
    if (expected !== null || buffered.length > 0) {
      onError(new Error('TCP message truncated: connection closed mid-message'));
      return;
    }
    if (!socket.destroyed) socket.end();
  });
  socket.on('timeout', () => {
    // RFC 7766 §6.2.3 — close the idle connection so resources are not
    // pinned indefinitely; clients are expected to reconnect on demand.
    if (!socket.destroyed) socket.end();
  });
  socket.on('error', err => onError(err));
  // Drain anything already buffered before our listener attached (in
  // particular, bytes unshifted by consumeProxyHeader).
  onReadable();
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
