const { debuglog } = require('node:util');
const { randomInt } = require('node:crypto');
const BufferReader = require('./lib/reader');
const BufferWriter = require('./lib/writer');

const debug = debuglog('dns2');

// Canonical IPv6 text form per RFC 5952:
//   - lower case hex, no leading zeros per group  (handled by toString(16))
//   - the longest run of >= 2 zero groups is replaced with "::"
//   - on ties, the first such run is chosen
//   - a single zero group is NOT compressed
const toIPv6 = buffer => {
  const segments = buffer.map(part => (part > 0 ? part.toString(16) : '0'));
  let bestStart = -1;
  let bestLen = 0;
  let curStart = -1;
  let curLen = 0;
  for (let i = 0; i < segments.length; i++) {
    if (segments[i] === '0') {
      if (curLen === 0) curStart = i;
      curLen++;
      if (curLen > bestLen) {
        bestLen = curLen;
        bestStart = curStart;
      }
    } else {
      curLen = 0;
    }
  }
  if (bestLen < 2) return segments.join(':');
  const before = segments.slice(0, bestStart).join(':');
  const after = segments.slice(bestStart + bestLen).join(':');
  return `${before}::${after}`;
};

const fromIPv6 = address => {
  const digits = address.split(':');
  // CAVEAT edge case for :: and IPs starting
  // or ending by ::
  if (digits[0] === '') {
    digits.shift();
  }
  if (digits[digits.length - 1] === '') {
    digits.pop();
  }
  // node js 10 does not support Array.prototype.flatMap
  if (!Array.prototype.flatMap) {
    Array.prototype.flatMap = function (f, ctx) {
      return this.reduce((r, x, i, a) => r.concat(f.call(ctx, x, i, a)), []);
    };
  }

  // CAVEAT we have to take into account
  // the extra space used by the empty string
  const missingFields = 8 - digits.length + 1;
  return digits.flatMap(digit => {
    if (digit === '') {
      return Array(missingFields).fill('0');
    }
    return digit.padStart(4, '0');
  });
};

/**
 * [Packet description]
 * @param {[type]} data [description]
 * @docs https://tools.ietf.org/html/rfc1034
 * @docs https://tools.ietf.org/html/rfc1035
 *
 * <Buffer 29 64 01 00 00 01 00 00 00 00 00 00
 *       |-ID----------- HEADER ----------->|
 *
 *  03 77 77 77 01 7a 02 63 6e 00 00 01 00 01>
 *   <-W--W--W-----Z-----C--N>|<----------->|
 */
function Packet(data) {
  this.header = {};
  this.questions = [];
  this.answers = [];
  this.authorities = [];
  this.additionals = [];
  if (data instanceof Packet) {
    return data;
  } else if (data instanceof Packet.Header) {
    this.header = data;
  } else if (data instanceof Packet.Question) {
    this.questions.push(data);
  } else if (data instanceof Packet.Resource) {
    this.answers.push(data);
  } else if (typeof data === 'string') {
    this.questions.push(data);
  } else if (typeof data === 'object') {
    const type = {}.toString.call(data).match(/\[object (\w+)\]/)[1];
    if (type === 'Array') {
      this.questions = data;
    }
    if (type === 'Object') {
      this.header = data;
    }
  }
  return this;
}

/**
 * [QUERY_TYPE description]
 * @type {Object}
 * @docs https://tools.ietf.org/html/rfc1035#section-3.2.2
 */
Packet.TYPE = {
  A: 0x01,
  NS: 0x02,
  MD: 0x03,
  MF: 0x04,
  CNAME: 0x05,
  SOA: 0x06,
  MB: 0x07,
  MG: 0x08,
  MR: 0x09,
  NULL: 0x0a,
  WKS: 0x0b,
  PTR: 0x0c,
  HINFO: 0x0d,
  MINFO: 0x0e,
  MX: 0x0f,
  TXT: 0x10,
  AAAA: 0x1c,
  SRV: 0x21,
  EDNS: 0x29,
  SPF: 0x63,
  AXFR: 0xfc,
  MAILB: 0xfd,
  MAILA: 0xfe,
  ANY: 0xff,
  CAA: 0x101,
  DNSKEY: 0x30,
};
/**
 * [QUERY_CLASS description]
 * @type {Object}
 * @docs https://tools.ietf.org/html/rfc1035#section-3.2.4
 */
Packet.CLASS = {
  IN: 0x01,
  CS: 0x02,
  CH: 0x03,
  HS: 0x04,
  ANY: 0xff,
};
/**
 * DNS response codes
 * @type {Object}
 * @docs https://tools.ietf.org/html/rfc1035#section-4.1.1
 */
Packet.RCODE = {
  NOERROR: 0,
  FORMERR: 1,
  SERVFAIL: 2,
  NXDOMAIN: 3,
  NOTIMP: 4,
  REFUSED: 5,
};
/**
 * [EDNS_OPTION_CODE description]
 * @type {Object}
 * @docs https://tools.ietf.org/html/rfc6891#section-6.1.2
 */
Packet.EDNS_OPTION_CODE = {
  ECS: 0x08,
};

/**
 * Generate a cryptographically random 16-bit DNS transaction ID.
 * RFC 5452 §3 — the full 16-bit space must be used from a CSPRNG to make
 * response forgery / cache poisoning impractical.
 * @return {number} integer in [0, 0xFFFF]
 */
Packet.uuid = function () {
  return randomInt(0x10000);
};

/**
 * [parse description]
 * @param  {[type]} buffer [description]
 * @return {[type]}        [description]
 */
Packet.parse = function (buffer) {
  const packet = new Packet();
  const reader = new Packet.Reader(buffer);
  packet.header = Packet.Header.parse(reader);
  [
    // props             parser              count
    ['questions', Packet.Question, packet.header.qdcount],
    ['answers', Packet.Resource, packet.header.ancount],
    ['authorities', Packet.Resource, packet.header.nscount],
    ['additionals', Packet.Resource, packet.header.arcount],
  ].forEach(function (def) {
    const section = def[0];
    const decoder = def[1];
    let count = def[2];
    while (count--) {
      try {
        packet[section] = packet[section] || [];
        packet[section].push(decoder.parse(reader));
      } catch (e) {
        debug('node-dns > parse %s error:', section, e.message);
      }
    }
  });
  // RFC 6891 §6.1.3: when an OPT record is present the wire RCODE is 12 bits:
  // the 4 low bits come from the header, the 8 high bits come from the OPT
  // record's TTL high byte. Merge them so callers see the full 12-bit value.
  const opt = packet.additionals.find(r => r && r.type === Packet.TYPE.EDNS);
  if (opt && opt.extendedRcode) {
    packet.header.rcode =
      (opt.extendedRcode << 4) | (packet.header.rcode & 0xf);
  }
  return packet;
};

/**
 * recursive
 */
Object.defineProperty(Packet.prototype, 'recursive', {
  enumerable: true,
  configurable: true,
  get() {
    return !!this.header.rd;
  },
  set(yn) {
    this.header.rd = +yn;
  },
});

/**
 * [toBuffer description]
 * @return {[type]} [description]
 */
Packet.prototype.toBuffer = function (writer) {
  writer = writer || new Packet.Writer();
  // RFC 1035 §4.1.4 — record the byte offset of each name we encode so later
  // occurrences can be replaced by a compression pointer. The map is owned by
  // the top-level message writer; rdata encoders that recursively encode
  // names participate automatically.
  if (!writer.names) writer.names = new Map();
  this.header.qdcount = this.questions.length;
  this.header.ancount = this.answers.length;
  this.header.nscount = this.authorities.length;
  this.header.arcount = this.additionals.length;
  if (!(this instanceof Packet.Header)) {
    this.header = new Packet.Header(this.header);
  }
  // RFC 6891 §6.1.3: if the caller set a header.rcode >= 16 the high byte must
  // be carried in the OPT record's TTL. Propagate it before the header is
  // serialized so the low nibble alone goes into the header.
  if (this.header.rcode > 0xf) {
    const opt = this.additionals.find(r => r && r.type === Packet.TYPE.EDNS);
    if (opt) {
      opt.extendedRcode = (this.header.rcode >>> 4) & 0xff;
      opt.ttl = ednsTtl(opt.extendedRcode, opt.version || 0, opt.doFlag);
    } else {
      debug(
        'node-dns > rcode %d > 15 but no OPT record; truncating to low nibble',
        this.header.rcode,
      );
    }
  }
  this.header.toBuffer(writer);
  [
    // section          encoder
    ['questions', Packet.Question],
    ['answers', Packet.Resource],
    ['authorities', Packet.Resource],
    ['additionals', Packet.Resource],
  ].forEach(
    function (def) {
      const section = def[0];
      const Encoder = def[1];
      (this[section] || []).forEach(function (resource) {
        Encoder.encode(resource, writer);
      });
    }.bind(this),
  );
  return writer.toBuffer();
};

/**
 * [Header description]
 * @param {[type]} options [description]
 * @docs https://tools.ietf.org/html/rfc1035#section-4.1.1
 */
Packet.Header = function (header) {
  this.id = 0;
  this.qr = 0;
  this.opcode = 0;
  this.aa = 0;
  this.tc = 0;
  this.rd = 0;
  this.ra = 0;
  this.z = 0;
  this.ad = 0;
  this.cd = 0;
  this.rcode = 0;
  this.qdcount = 0;
  this.ancount = 0;
  this.nscount = 0;
  this.arcount = 0;
  for (const k in header) {
    this[k] = header[k];
  }
  return this;
};
/**
 * [parse description]
 * @param  {[type]} buffer [description]
 * @return {[type]}        [description]
 * @docs https://tools.ietf.org/html/rfc1035#section-4.1.1
 */
Packet.Header.parse = function (reader) {
  const header = new Packet.Header();
  if (reader instanceof Buffer) {
    reader = new Packet.Reader(reader);
  }
  header.id = reader.read(16);
  header.qr = reader.read(1);
  header.opcode = reader.read(4);
  header.aa = reader.read(1);
  header.tc = reader.read(1);
  header.rd = reader.read(1);
  header.ra = reader.read(1);
  // RFC 4035 §3.2.3 repurposed the second and third Z bits as AD and CD.
  header.z = reader.read(1);
  header.ad = reader.read(1);
  header.cd = reader.read(1);
  header.rcode = reader.read(4);
  header.qdcount = reader.read(16);
  header.ancount = reader.read(16);
  header.nscount = reader.read(16);
  header.arcount = reader.read(16);
  return header;
};

/**
 * [toBuffer description]
 * @return {[type]} [description]
 */
Packet.Header.prototype.toBuffer = function (writer) {
  writer = writer || new Packet.Writer();
  writer.write(this.id, 16);
  writer.write(this.qr, 1);
  writer.write(this.opcode, 4);
  writer.write(this.aa, 1);
  writer.write(this.tc, 1);
  writer.write(this.rd, 1);
  writer.write(this.ra, 1);
  // RFC 1035 §4.1.1: the Z bit is reserved and must be zero in outgoing
  // messages, regardless of what was preserved from any inbound packet.
  writer.write(0, 1);
  writer.write(this.ad, 1);
  writer.write(this.cd, 1);
  writer.write(this.rcode & 0xf, 4);
  writer.write(this.qdcount, 16);
  writer.write(this.ancount, 16);
  writer.write(this.nscount, 16);
  writer.write(this.arcount, 16);
  return writer.toBuffer();
};

/**
 * Question section format
 * @docs https://tools.ietf.org/html/rfc1035#section-4.1.2
 */
Packet.Question = function (name, type, cls) {
  const defaults = {
    type: Packet.TYPE.ANY,
    class: Packet.CLASS.ANY,
  };
  if (typeof name === 'object') {
    for (const k in name) {
      this[k] = name[k] || defaults[k];
    }
  } else {
    this.name = name;
    this.type = type || defaults.type;
    this.class = cls || defaults.class;
  }
  return this;
};

/**
 * [toBuffer description]
 * @param  {[type]} writer [description]
 * @return {[type]}        [description]
 */
Packet.Question.prototype.toBuffer = function (writer) {
  return Packet.Question.encode(this, writer);
};

/**
 * [parse description]
 * @param  {[type]} reader [description]
 * @return {[type]}        [description]
 */
Packet.Question.parse = Packet.Question.decode = function (reader) {
  const question = new Packet.Question();
  if (reader instanceof Buffer) {
    reader = new Packet.Reader(reader);
  }
  question.name = Packet.Name.decode(reader);
  question.type = reader.read(16);
  question.class = reader.read(16);
  return question;
};

Packet.Question.encode = function (question, writer) {
  const ownsWriter = !writer;
  writer = writer || new Packet.Writer();
  Packet.Name.encode(question.name, writer);
  writer.write(question.type, 16);
  writer.write(question.class, 16);
  return ownsWriter ? writer.toBuffer() : undefined;
};

/**
 * Resource record format
 * @docs https://tools.ietf.org/html/rfc1035#section-4.1.3
 */
Packet.Resource = function (name, type, cls, ttl) {
  const defaults = {
    name: '',
    ttl: 300,
    type: Packet.TYPE.ANY,
    class: Packet.CLASS.ANY,
  };
  let input;
  if (typeof name === 'object') {
    input = name;
  } else {
    input = {
      name,
      type,
      class: cls,
      ttl,
    };
  }
  Object.assign(this, defaults, input);
  return this;
};

/**
 * [toBuffer description]
 * @param  {[type]} writer [description]
 * @return {[type]}        [description]
 */
Packet.Resource.prototype.toBuffer = function (writer) {
  return Packet.Resource.encode(this, writer);
};

/**
 * [encode description]
 * @param  {[type]} resource [description]
 * @param  {[type]} writer   [description]
 * @return {[type]}          [description]
 */
Packet.Resource.encode = function (resource, writer) {
  writer = writer || new Packet.Writer();
  Packet.Name.encode(resource.name, writer);
  writer.write(resource.type, 16);
  writer.write(resource.class, 16);
  // RFC 2181 §8: TTL is an unsigned 32-bit value but high-bit values are
  // historically unsafe; clamp to 2^31 - 1 on the wire.
  writer.write(Math.min(resource.ttl >>> 0, 0x7fffffff), 32);
  const encoder = Object.keys(Packet.TYPE).filter(function (type) {
    return resource.type === Packet.TYPE[type];
  })[0];
  // RDLENGTH is owned here, not by each rdata encoder. We write a 16-bit
  // placeholder, dispatch to the rdata encoder, then back-fill the length.
  // This is what lets rdata encoders use compression pointers without having
  // to predict their compressed length up front.
  const rdlenBitPos = writer.bitLength();
  writer.write(0, 16);
  const rdataBitStart = writer.bitLength();
  if (encoder in Packet.Resource && Packet.Resource[encoder].encode) {
    Packet.Resource[encoder].encode(resource, writer);
  } else {
    debug('node-dns > unknown encoder %s(%j)', encoder, resource.type);
    // Fallback for unknown / decoder-only types: round-trip the raw RDATA the
    // decoder preserved as `resource.data`. Without this, RDATA would be
    // omitted entirely, truncating the wire format and corrupting any
    // records that follow.
    const data = Buffer.isBuffer(resource.data)
      ? resource.data
      : Buffer.alloc(0);
    for (const byte of data) {
      writer.write(byte, 8);
    }
  }
  const rdlen = (writer.bitLength() - rdataBitStart) / 8;
  writer.patch(rdlenBitPos, rdlen, 16);
  return writer.toBuffer();
};
/**
 * [parse description]
 * @param  {[type]} reader [description]
 * @return {[type]}        [description]
 */
Packet.Resource.parse = Packet.Resource.decode = function (reader) {
  if (reader instanceof Buffer) {
    reader = new Packet.Reader(reader);
  }
  let resource = new Packet.Resource();
  resource.name = Packet.Name.decode(reader);
  resource.type = reader.read(16);
  resource.class = reader.read(16);
  resource.ttl = reader.read(32);
  // RFC 2181 §8: TTLs are an unsigned 32-bit field but legacy implementations
  // treated them as signed. Anything with the high bit set is clamped to
  // 2^31 - 1 so it cannot be misinterpreted as a negative value.
  if (resource.ttl > 0x7fffffff) resource.ttl = 0x7fffffff;
  let length = reader.read(16);
  const parser = Object.keys(Packet.TYPE).filter(function (type) {
    return resource.type === Packet.TYPE[type];
  })[0];
  if (parser in Packet.Resource) {
    resource = Packet.Resource[parser].decode.call(resource, reader, length);
  } else {
    debug('node-dns > unknown parser type: %s(%j)', parser, resource.type);
    const arr = [];
    while (length--) arr.push(reader.read(8));
    resource.data = Buffer.from(arr);
  }
  return resource;
};

/**
 * [encode_name description]
 * @param  {[type]} domain [description]
 * @return {[type]}        [description]
 */
// RFC 1035 §2.3.4 — wire-format limits.
Packet.Name = {
  COPY: 0xc0,
  MAX_LABEL: 63,
  MAX_NAME: 255,
  decode: function (reader) {
    if (reader instanceof Buffer) {
      reader = new Packet.Reader(reader);
    }
    const name = [];
    let o;
    let len = reader.read(8);
    // Track each pointer target we follow. A crafted packet can chain
    // pointers in a cycle; without this guard, decode would loop forever.
    const visited = new Set();
    // Cumulative wire-format octets consumed for this name. RFC 1035 §2.3.4
    // caps the total — including the trailing zero-length root label — at
    // 255, so the running tally starts at 1 (the terminator) and adds the
    // length byte + label bytes for each non-root label.
    let totalOctets = 1;
    while (len) {
      if ((len & Packet.Name.COPY) === Packet.Name.COPY) {
        len -= Packet.Name.COPY;
        len = len << 8;
        const pos = len + reader.read(8);
        if (visited.has(pos)) {
          throw new Error('Name decode: pointer cycle detected');
        }
        visited.add(pos);
        if (!o) o = reader.offset;
        reader.offset = pos * 8;
        len = reader.read(8);
        continue;
      }
      // RFC 1035: a label length byte has its top two bits clear (00).
      // The 01/10 combinations are reserved and indicate a malformed name.
      if (len & 0xc0) {
        throw new Error(
          `Name decode: invalid label length byte 0x${len.toString(16)}`,
        );
      }
      if (len > Packet.Name.MAX_LABEL) {
        throw new Error(
          `Name decode: label exceeds ${Packet.Name.MAX_LABEL} octets`,
        );
      }
      totalOctets += len + 1;
      if (totalOctets > Packet.Name.MAX_NAME) {
        throw new Error(
          `Name decode: name exceeds ${Packet.Name.MAX_NAME} octets`,
        );
      }
      let part = '';
      while (len--) part += String.fromCharCode(reader.read(8));
      name.push(part);
      len = reader.read(8);
    }
    if (o) reader.offset = o;
    return name.join('.');
  },
  encode: function (domain, writer) {
    // Only materialize a Buffer when we created the writer; if the caller
    // passed one, they own the final toBuffer() and we avoid an O(buffer)
    // materialization per name (a big deal once many records share a suffix).
    const ownsWriter = !writer;
    writer = writer || new Packet.Writer();
    const parts = (domain || '').split('.').filter(part => !!part);
    let totalOctets = 1; // root terminator
    for (const part of parts) {
      if (part.length > Packet.Name.MAX_LABEL) {
        throw new Error(
          `Name encode: label "${part}" is ${part.length} octets ` +
            `(max ${Packet.Name.MAX_LABEL})`,
        );
      }
      totalOctets += part.length + 1;
    }
    if (totalOctets > Packet.Name.MAX_NAME) {
      throw new Error(
        `Name encode: name "${domain}" encodes to ${totalOctets} octets ` +
          `(max ${Packet.Name.MAX_NAME})`,
      );
    }
    // RFC 1035 §4.1.4 — if the writer carries a name-offset table, emit a
    // compression pointer for any suffix we've already serialized; otherwise
    // record this suffix at its current byte offset so later names can point
    // here. Compression pointers can address only the first 16 KiB of a
    // message (14-bit offset); past that we fall back to literal labels.
    const compress = writer.names instanceof Map;
    for (let i = 0; i < parts.length; i++) {
      const suffix = parts.slice(i).join('.').toLowerCase();
      if (compress && writer.names.has(suffix)) {
        writer.write(0xc000 | writer.names.get(suffix), 16);
        return ownsWriter ? writer.toBuffer() : undefined;
      }
      if (compress) {
        const byteOffset = writer.byteLength();
        if (byteOffset < 0x4000) writer.names.set(suffix, byteOffset);
      }
      writer.write(parts[i].length, 8);
      for (let j = 0; j < parts[i].length; j++) {
        writer.write(parts[i].charCodeAt(j), 8);
      }
    }
    writer.write(0, 8);
    return ownsWriter ? writer.toBuffer() : undefined;
  },
};

/**
 * [A description]
 * @type {Object}
 * @docs https://tools.ietf.org/html/rfc1035#section-3.4.1
 */
Packet.Resource.A = function (address) {
  this.type = Packet.TYPE.A;
  this.class = Packet.CLASS.IN;
  this.address = address;
  return this;
};

Packet.Resource.A.encode = function (record, writer) {
  writer = writer || new Packet.Writer();
  // RDLENGTH is written by Packet.Resource.encode; only emit the rdata here.
  // No toBuffer() — the caller owns materialization (avoids O(N) re-walks of
  // the message bit-array per record).
  record.address.split('.').forEach(function (part) {
    writer.write(parseInt(part, 10), 8);
  });
};

Packet.Resource.A.decode = function (reader, length) {
  const parts = [];
  while (length--) parts.push(reader.read(8));
  this.address = parts.join('.');
  return this;
};

/**
 * [MX description]
 * @param {[type]} exchange [description]
 * @param {[type]} priority [description]
 * @docs https://tools.ietf.org/html/rfc1035#section-3.3.9
 */
Packet.Resource.MX = function (exchange, priority) {
  this.type = Packet.TYPE.MX;
  this.class = Packet.CLASS.IN;
  this.exchange = exchange;
  this.priority = priority;
  return this;
};
/**
 * [encode description]
 * @param  {[type]} record [description]
 * @param  {[type]} writer [description]
 * @return {[type]}        [description]
 */
Packet.Resource.MX.encode = function (record, writer) {
  writer = writer || new Packet.Writer();
  writer.write(record.priority, 16);
  Packet.Name.encode(record.exchange, writer);
};
/**
 * [decode description]
 * @param  {[type]} reader [description]
 * @param  {[type]} length [description]
 * @return {[type]}        [description]
 */
Packet.Resource.MX.decode = function (reader, length) {
  this.priority = reader.read(16);
  this.exchange = Packet.Name.decode(reader);
  return this;
};
/**
 * [AAAA description]
 * @type {Object}
 * @docs https://en.wikipedia.org/wiki/IPv6
 */
Packet.Resource.AAAA = {
  decode: function (reader, length) {
    const parts = [];
    while (length) {
      length -= 2;
      parts.push(reader.read(16));
    }
    this.address = toIPv6(parts);
    return this;
  },
  encode: function (record, writer) {
    writer = writer || new Packet.Writer();
    fromIPv6(record.address).forEach(function (part) {
      writer.write(parseInt(part, 16), 16);
    });
  },
};
/**
 * [NS description]
 * @type {Object}
 * @docs https://tools.ietf.org/html/rfc1035#section-3.3.11
 */
Packet.Resource.NS = {
  decode: function (reader, length) {
    this.ns = Packet.Name.decode(reader);
    return this;
  },
  encode: function (record, writer) {
    writer = writer || new Packet.Writer();
    Packet.Name.encode(record.ns, writer);
  },
};
/**
 * [CNAME description]
 * @type {Object}
 * @docs https://tools.ietf.org/html/rfc1035#section-3.3.1
 */
Packet.Resource.PTR = Packet.Resource.CNAME = {
  decode: function (reader, length) {
    this.domain = Packet.Name.decode(reader);
    return this;
  },
  encode: function (record, writer) {
    writer = writer || new Packet.Writer();
    Packet.Name.encode(record.domain, writer);
  },
};
/**
 * [SPF description]
 * @type {[type]}
 * @docs https://tools.ietf.org/html/rfc1035#section-3.3.14
 */
Packet.Resource.SPF = Packet.Resource.TXT = {
  decode: function (reader, length) {
    const parts = [];
    let bytesRead = 0;
    let chunkLength;

    while (bytesRead < length) {
      chunkLength = reader.read(8); // text length
      bytesRead++;

      while (chunkLength--) {
        parts.push(reader.read(8));
        bytesRead++;
      }
    }

    this.data = Buffer.from(parts).toString('utf8');
    return this;
  },
  encode: function (record, writer) {
    writer = writer || new Packet.Writer();

    // make sure that resource data is a an array of strings
    const characterStrings = Array.isArray(record.data)
      ? record.data
      : [record.data];
    // convert array of strings to array of buffers
    const characterStringBuffers = characterStrings
      .map(function (characterString) {
        if (Buffer.isBuffer(characterString)) {
          return characterString;
        }
        if (typeof characterString === 'string') {
          return Buffer.from(characterString, 'utf8');
        }
        return false;
      })
      .filter(function (characterString) {
        // remove invalid values from the array
        return characterString;
      });

    // write each string to output (RDLENGTH is back-filled by Resource.encode)
    characterStringBuffers.forEach(function (buffer) {
      writer.write(buffer.length, 8); // text length
      buffer.forEach(function (c) {
        writer.write(c, 8);
      });
    });
  },
};
/**
 * [SOA description]
 * @type {Object}
 * @docs https://tools.ietf.org/html/rfc1035#section-3.3.13
 */
Packet.Resource.SOA = {
  decode: function (reader, length) {
    this.primary = Packet.Name.decode(reader);
    this.admin = Packet.Name.decode(reader);
    this.serial = reader.read(32);
    this.refresh = reader.read(32);
    this.retry = reader.read(32);
    this.expiration = reader.read(32);
    this.minimum = reader.read(32);
    return this;
  },
  encode: function (record, writer) {
    writer = writer || new Packet.Writer();
    Packet.Name.encode(record.primary, writer);
    Packet.Name.encode(record.admin, writer);
    writer.write(record.serial, 32);
    writer.write(record.refresh, 32);
    writer.write(record.retry, 32);
    writer.write(record.expiration, 32);
    // RFC 2308 §4: the SOA minimum field is also a TTL; same 31-bit ceiling.
    writer.write(Math.min(record.minimum >>> 0, 0x7fffffff), 32);
  },
};
/**
 * [SRV description]
 * @type {Object}
 * @docs https://tools.ietf.org/html/rfc2782
 */
Packet.Resource.SRV = {
  decode: function (reader, length) {
    this.priority = reader.read(16);
    this.weight = reader.read(16);
    this.port = reader.read(16);
    this.target = Packet.Name.decode(reader);
    return this;
  },
  encode: function (record, writer) {
    writer = writer || new Packet.Writer();
    writer.write(record.priority, 16);
    writer.write(record.weight, 16);
    writer.write(record.port, 16);
    Packet.Name.encode(record.target, writer);
  },
};

// RFC 6891 §6.1.3 — the OPT record's TTL field carries:
//   bits  0- 7: extended RCODE (high byte of a 12-bit RCODE)
//   bits  8-15: EDNS version
//   bit   16:   DO (DNSSEC OK)
//   bits 17-31: reserved Z, must be zero
const ednsTtl = (extendedRcode, version, doFlag) =>
  (((extendedRcode & 0xff) << 24) >>> 0) |
  ((version & 0xff) << 16) |
  (doFlag ? 0x8000 : 0);

// RFC 6891 §6.2.5 — a reasonable default for the requestor's UDP payload size.
// The pre-EDNS 512-byte limit is conservative; modern resolvers advertise
// 4096 so upstreams need not truncate responses that fit in a typical MTU.
Packet.EDNS_DEFAULT_UDP_PAYLOAD_SIZE = 4096;

Packet.Resource.EDNS = function (rdata, opts = {}) {
  const extendedRcode = opts.extendedRcode || 0;
  const version = opts.version || 0;
  const doFlag = !!opts.doFlag;
  const udpPayloadSize =
    opts.udpPayloadSize || Packet.EDNS_DEFAULT_UDP_PAYLOAD_SIZE;
  return {
    type: Packet.TYPE.EDNS,
    class: udpPayloadSize,
    ttl: ednsTtl(extendedRcode, version, doFlag),
    extendedRcode,
    version,
    doFlag,
    rdata, // Objects of type Packet.Resource.EDNS.*
  };
};

Packet.Resource.EDNS.decode = function (reader, length) {
  // When invoked through Resource.parse, this.type/class/ttl are already set
  // from the wire. Direct callers (e.g. unit tests) hit defaults instead.
  this.type = this.type ?? Packet.TYPE.EDNS;
  this.class = this.class ?? Packet.EDNS_DEFAULT_UDP_PAYLOAD_SIZE;
  const ttl = this.ttl ?? 0;
  this.ttl = ttl;
  this.extendedRcode = (ttl >>> 24) & 0xff;
  this.version = (ttl >>> 16) & 0xff;
  this.doFlag = !!(ttl & 0x8000);
  this.rdata = [];

  while (length) {
    const optionCode = reader.read(16);
    const optionLength = reader.read(16); // In octet (https://tools.ietf.org/html/rfc6891#page-8)

    const decoder = Object.keys(Packet.EDNS_OPTION_CODE).filter(
      function (type) {
        return optionCode === Packet.EDNS_OPTION_CODE[type];
      },
    )[0];
    if (
      decoder in Packet.Resource.EDNS &&
      Packet.Resource.EDNS[decoder].decode
    ) {
      const rdata = Packet.Resource.EDNS[decoder].decode(reader, optionLength);
      this.rdata.push(rdata);
    } else {
      reader.read(optionLength); // Ignore data that doesn't understand
      debug(
        'node-dns > unknown EDNS rdata decoder %s(%j)',
        decoder,
        optionCode,
      );
    }

    length = length - 4 - optionLength;
  }
  return this;
};

Packet.Resource.EDNS.encode = function (record, writer) {
  writer = writer || new Packet.Writer();
  // RDLENGTH is owned by Packet.Resource.encode; emit option records back to
  // back into the main writer.
  for (const rdata of record.rdata) {
    const encoder = Object.keys(Packet.EDNS_OPTION_CODE).filter(
      function (type) {
        return rdata.ednsCode === Packet.EDNS_OPTION_CODE[type];
      },
    )[0];
    if (
      encoder in Packet.Resource.EDNS &&
      Packet.Resource.EDNS[encoder].encode
    ) {
      const w = new Packet.Writer();
      Packet.Resource.EDNS[encoder].encode(rdata, w);
      writer.write(rdata.ednsCode, 16);
      writer.write(w.buffer.length / 8, 16);
      writer.writeBuffer(w);
    } else {
      debug(
        'node-dns > unknown EDNS rdata encoder %s(%j)',
        encoder,
        rdata.ednsCode,
      );
    }
  }
};

Packet.Resource.EDNS.ECS = function (clientIp) {
  const [ip, prefixLength] = clientIp.split('/');
  const numPrefixLength = parseInt(prefixLength) || 32;
  return {
    ednsCode: Packet.EDNS_OPTION_CODE.ECS,
    family: 1,
    sourcePrefixLength: numPrefixLength,
    scopePrefixLength: 0,
    ip,
  };
};

Packet.Resource.EDNS.ECS.decode = function (reader, length) {
  const rdata = {};
  rdata.ednsCode = Packet.EDNS_OPTION_CODE.ECS;
  rdata.family = reader.read(16);
  rdata.sourcePrefixLength = reader.read(8);
  rdata.scopePrefixLength = reader.read(8);
  length -= 4;

  if (rdata.family === 1) {
    const ipv4Octets = [];
    while (length--) {
      const octet = reader.read(8);
      ipv4Octets.push(octet);
    }
    while (ipv4Octets.length < 4) {
      ipv4Octets.push(0);
    }
    rdata.ip = ipv4Octets.join('.');
  }

  if (rdata.family === 2) {
    const ipv6Segments = [];
    for (; length; length -= 2) {
      const segment = reader.read(16).toString(16);
      ipv6Segments.push(segment);
    }
    while (ipv6Segments.length < 8) {
      ipv6Segments.push('0');
    }
    rdata.ip = ipv6Segments.join(':');
  }

  return rdata;
};

Packet.Resource.EDNS.ECS.encode = function (record, writer) {
  // RFC 7871 §6: the ADDRESS field carries only the leftmost
  // ceil(sourcePrefixLength / 8) octets.
  const octets = Math.ceil(record.sourcePrefixLength / 8);
  writer.write(record.family, 16);
  writer.write(record.sourcePrefixLength, 8);
  writer.write(record.scopePrefixLength, 8);
  let bytes;
  if (record.family === 1) {
    bytes = record.ip.split('.').map(s => parseInt(s, 10) || 0);
  } else if (record.family === 2) {
    bytes = expandIPv6ToBytes(record.ip);
  } else {
    throw new Error(`EDNS.ECS encode: unsupported family ${record.family}`);
  }
  for (let i = 0; i < octets; i++) {
    writer.write(bytes[i] || 0, 8);
  }
};

// Expand a (possibly compressed) IPv6 text address into a 16-byte array.
function expandIPv6ToBytes(address) {
  let head, tail;
  const idx = address.indexOf('::');
  if (idx === -1) {
    head = address.split(':');
    tail = [];
  } else {
    head = address.slice(0, idx).split(':').filter(Boolean);
    tail = address
      .slice(idx + 2)
      .split(':')
      .filter(Boolean);
  }
  const missing = 8 - head.length - tail.length;
  const groups = [...head, ...new Array(missing).fill('0'), ...tail];
  const out = new Array(16).fill(0);
  for (let g = 0; g < 8; g++) {
    const n = parseInt(groups[g], 16) || 0;
    out[g * 2] = (n >> 8) & 0xff;
    out[g * 2 + 1] = n & 0xff;
  }
  return out;
}

Packet.Resource.CAA = {
  encode: function (record, writer) {
    writer = writer || new Packet.Writer();
    // RDLENGTH is written by Packet.Resource.encode.
    const buffer = Buffer.from(record.tag + record.value, 'utf8');
    writer.write(record.flags, 8);
    writer.write(record.tag.length, 8);

    buffer.forEach(function (c) {
      writer.write(c, 8);
    });
  },
  decode: function (reader, length) {
    this.flags = reader.read(8);
    const tagLength = reader.read(8);
    const bytes = [];
    let remaining = length - 2;
    while (remaining--) bytes.push(reader.read(8));
    const buffer = Buffer.from(bytes);
    this.tag = buffer.slice(0, tagLength).toString('utf8');
    this.value = buffer.slice(tagLength).toString('utf8');
    return this;
  },
};

/**
 * @type {{decode: (function(*, *): Packet.Resource.DNSKEY)}}
 * @link https://tools.ietf.org/html/rfc4034
 * @link https://www.iana.org/assignments/dns-sec-alg-numbers/dns-sec-alg-numbers.xhtml#table-dns-sec-alg-numbers-1
 */
Packet.Resource.DNSKEY = {
  decode: function (reader, length) {
    const RData = [];
    while (RData.length < length) {
      RData.push(reader.read(8));
    }
    this.flags = (RData[0] << 8) | RData[1];
    this.protocol = RData[2];
    this.algorithm = RData[3];
    // for key tag
    let ac = 0;
    for (let i = 0; i < length; ++i) {
      ac += i & 1 ? RData[i] : RData[i] << 8;
    }
    ac += (ac >> 16) & 0xffff;
    this.keyTag = ac & 0xffff;

    //  0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 = 16
    // convert binary flags
    let binFlags = this.flags.toString(2);
    // add left padding until 16 chars
    while (binFlags.length < 16) {
      binFlags = '0' + binFlags;
    }
    this.zoneKey = binFlags[7] === '1';
    this.zoneSep = binFlags[15] === '1';
    this.key = Buffer.from(RData.slice(4)).toString('base64');
    return this;
  },
  encode: function (record, writer) {
    writer = writer || new Packet.Writer();
    // RDLENGTH is written by Packet.Resource.encode.
    const buffer = Buffer.from(record.key, 'base64');
    writer.write(record.flags, 16);
    writer.write(record.protocol, 8);
    writer.write(record.algorithm, 8);
    buffer.forEach(function (c) {
      writer.write(c, 8);
    });
  },
};

/**
 * RRSIG just support decode
 * test with dns.resolveRRSIG('example.com')
 *
 * @type {{decode: (function(*, *): Packet.Resource.RRSIG)}}
 */
Packet.Resource.RRSIG = {
  decode: function (reader, length) {
    function dateForSig(date) {
      // javascript date is from millisecond
      date = new Date(date * 1000);
      const definitions = {
        month: date.getUTCMonth() + 1,
        date: date.getUTCDate(),
        hour: date.getUTCHours(),
        minutes: date.getUTCMinutes(),
        seconds: date.getUTCSeconds(),
      };
      let i;
      for (i in definitions) {
        // if less than 10 > single
        if (definitions[i] < 10) {
          definitions[i] = '0' + '' + definitions[i];
        }
      }
      return (
        date.getFullYear() +
        '' +
        definitions.month +
        '' +
        definitions.date +
        '' +
        definitions.hour +
        '' +
        definitions.minutes +
        '' +
        definitions.seconds
      );
    }

    // calculate max-offset uint8
    const maxOffset = reader.offset + length * 8;
    /*
     * Stuff sign contains 18 octets
     */
    this.sigType = reader.read(16); // 2
    this.algorithm = reader.read(8); // 1
    this.labels = reader.read(8); // 1
    this.originalTtl = reader.read(32); // 4
    this.expiration = dateForSig(reader.read(32)); // 4
    this.inception = dateForSig(reader.read(32)); // 4
    this.keyTag = reader.read(16); // 2
    this.signer = Packet.Name.decode(reader);
    const maxLength = (maxOffset - reader.offset) / 8;
    const signature = [];
    while (signature.length < maxLength) {
      signature.push(reader.read(8));
    }
    this.signature = Buffer.from(signature).toString('base64');
    return this;
  },
};

Packet.Reader = BufferReader;
Packet.Writer = BufferWriter;

Packet.createResponseFromRequest = function (request) {
  const response = new Packet();
  response.header = new Packet.Header({
    id: request.header.id,
    opcode: request.header.opcode,
    rd: request.header.rd,
    qr: 1,
  });
  response.questions = request.questions.slice();
  return response;
};

Packet.createResourceFromQuestion = function (base, record) {
  const resource = new Packet.Resource(base);
  Object.assign(resource, record);
  return resource;
};

Packet.readStream = socket => {
  let chunks = [];
  let chunklen = 0;
  let received = false;
  let expected = false;
  return new Promise((resolve, reject) => {
    const processMessage = () => {
      if (received) return;
      received = true;
      const buffer = Buffer.concat(chunks, chunklen);
      resolve(buffer.slice(2));
    };
    socket.on('end', processMessage);
    socket.on('error', reject);
    socket.on('readable', () => {
      let chunk;
      while ((chunk = socket.read()) !== null) {
        chunks.push(chunk);
        chunklen += chunk.length;
      }
      if (!expected && chunklen >= 2) {
        if (chunks.length > 1) {
          chunks = [Buffer.concat(chunks, chunklen)];
        }
        expected = chunks[0].readUInt16BE(0);
      }

      if (chunklen >= 2 + expected) {
        processMessage();
      }
    });
  });
};

/**
 * DoH
 * @docs https://tools.ietf.org/html/rfc8484
 */
Packet.prototype.toBase64URL = function () {
  const buffer = this.toBuffer();
  const base64 = buffer.toString('base64');
  return base64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
};

module.exports = Packet;
module.exports.toIPv6 = toIPv6;
module.exports.fromIPv6 = fromIPv6;
