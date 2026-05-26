const udp = require('node:dgram');
const Packet = require('../packet');
const proxyProtocol = require('../lib/proxy-protocol');

// RFC 1035 §2.3.4 / §4.2.1 — UDP messages without EDNS are capped at 512 bytes.
const DEFAULT_UDP_LIMIT = 512;

// Pick the negotiated UDP payload size: the requestor's EDNS OPT class field
// (RFC 6891 §6.2.3) if present and reasonable, otherwise 512.
const negotiatedPayloadSize = request => {
  if (!request || !Array.isArray(request.additionals)) return DEFAULT_UDP_LIMIT;
  const opt = request.additionals.find(r => r && r.type === Packet.TYPE.EDNS);
  if (!opt) return DEFAULT_UDP_LIMIT;
  // §6.2.3: values below 512 are senseless; clamp upward.
  return Math.max(opt.class || 0, DEFAULT_UDP_LIMIT);
};

// Serialize the response, fitting it into the negotiated UDP budget. If the
// natural serialization exceeds the budget, set TC=1 and drop sections so the
// client knows to retry over TCP rather than receive silently truncated data.
//
// RFC 1035 §4.2.1: oversized responses MUST set the TC bit. RFC 2181 §9 allows
// the server to drop whole RRsets it cannot fit; the simplest correct behavior
// is to keep only the question section.
const serializeForUdp = (message, maxBytes) => {
  if (message instanceof Packet) {
    let buffer = message.toBuffer();
    if (buffer.length <= maxBytes) return buffer;
    // Build a TC=1 response that carries only the header + question section.
    const truncated = new Packet();
    truncated.header = new Packet.Header(message.header);
    truncated.header.tc = 1;
    truncated.questions = message.questions.slice();
    truncated.answers = [];
    truncated.authorities = [];
    truncated.additionals = [];
    buffer = truncated.toBuffer();
    // Pathological: even header + question doesn't fit. Slice the buffer to
    // the limit; the TC bit at byte 2 bit 1 is already preserved at the front.
    if (buffer.length > maxBytes) buffer = buffer.slice(0, maxBytes);
    return buffer;
  }
  // Raw buffer: caller is responsible for sizing. The most we can do
  // safely is set the TC bit and slice. The header is the first 12 bytes;
  // the TC bit is bit 1 of byte 2.
  if (message.length <= maxBytes) return message;
  const out = Buffer.from(message);
  if (out.length >= 3) out[2] |= 0x02; // TC bit
  return out.slice(0, maxBytes);
};

/**
 * [Server description]
 * @docs https://tools.ietf.org/html/rfc1034
 * @docs https://tools.ietf.org/html/rfc1035
 */
class Server extends udp.Socket {
  constructor(options) {
    let type = 'udp4';
    let proxyProtocolEnabled = false;
    if (typeof options === 'object' && options !== null) {
      type = options.type ?? type;
      proxyProtocolEnabled = options.proxyProtocol ?? false;
    }
    super(type);
    this.proxyProtocol = proxyProtocolEnabled;
    if (typeof options === 'function') {
      this.on('request', options);
    }
    this.on('message', this.handle.bind(this));
  }

  handle(data, rinfo) {
    try {
      // Response is always sent back to the immediate sender (the proxy when
      // proxyProtocol is enabled); the parsed client info is exposed to the
      // request handler so it can log/authorize against the real peer.
      const responder = rinfo;
      let clientInfo = rinfo;
      if (this.proxyProtocol) {
        const parsed = proxyProtocol.parse(data);
        if (!parsed) throw new Error('PROXY protocol: incomplete header');
        if (parsed.header.command === 'PROXY') {
          clientInfo = {
            ...rinfo,
            address: parsed.header.sourceAddress,
            port: parsed.header.sourcePort,
            proxy: parsed.header,
          };
        } else {
          clientInfo = { ...rinfo, proxy: parsed.header };
        }
        data = data.slice(parsed.headerLength);
      }
      const message = Packet.parse(data);
      const ctx = {
        rinfo: responder,
        maxPayload: negotiatedPayloadSize(message),
      };
      this.emit('request', message, this.response.bind(this, ctx), clientInfo);
    } catch (e) {
      this.emit('requestError', e);
    }
  }

  response(ctx, message) {
    const rinfo = ctx && ctx.rinfo ? ctx.rinfo : ctx;
    const maxPayload = (ctx && ctx.maxPayload) || DEFAULT_UDP_LIMIT;
    const buffer = serializeForUdp(message, maxPayload);
    return new Promise((resolve, reject) => {
      this.send(buffer, rinfo.port, rinfo.address, err => {
        if (err) return reject(err);
        resolve(buffer);
      });
    });
  }

  listen(port, address) {
    return new Promise(resolve => this.bind(port, address, resolve));
  }
}

module.exports = Server;
