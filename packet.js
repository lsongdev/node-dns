const { debuglog } = require('util');
const BufferReader = require('./lib/reader');
const BufferWriter = require('./lib/writer');

const debug = debuglog('dns2');

const toIPv6 = buffer => buffer
  .map(part => (part > 0 ? part.toString(16) : '0'))
  .join(':')
  .replace(/\b(?:0+:){1,}/, ':');

const fromIPv6 = (address) => {
  const digits = address.split(':');
  // CAVEAT edge case for :: and IPs starting
  // or ending by ::
  if (digits[0] === '') {
    digits.shift();
  }
  if (digits[digits.length - 1] === '') {
    digits.pop();
  }
  // CAVEAT we have to take into account
  // the extra space used by the empty string
  const missingFields = 8 - digits.length + 1;
  return digits.flatMap((digit) => {
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
    const type = ({}).toString.call(data).match(/\[object (\w+)\]/)[1];
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
  A     : 0x01,
  NS    : 0x02,
  MD    : 0x03,
  MF    : 0x04,
  CNAME : 0x05,
  SOA   : 0x06,
  MB    : 0x07,
  MG    : 0x08,
  MR    : 0x09,
  NULL  : 0x0A,
  WKS   : 0x0B,
  PTR   : 0x0C,
  HINFO : 0x0D,
  MINFO : 0x0E,
  MX    : 0x0F,
  TXT   : 0x10,
  AAAA  : 0x1C,
  SRV   : 0x21,
  EDNS  : 0x29,
  SPF   : 0x63,
  AXFR  : 0xFC,
  MAILB : 0xFD,
  MAILA : 0xFE,
  ANY   : 0xFF,
  CAA   : 0x101,
};
/**
 * [QUERY_CLASS description]
 * @type {Object}
 * @docs https://tools.ietf.org/html/rfc1035#section-3.2.4
 */
Packet.CLASS = {
  IN  : 0x01,
  CS  : 0x02,
  CH  : 0x03,
  HS  : 0x04,
  ANY : 0xFF,
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
 * [uuid description]
 * @return {[type]} [description]
 */
Packet.uuid = function() {
  return Math.floor(Math.random() * 1e5);
};

/**
 * [parse description]
 * @param  {[type]} buffer [description]
 * @return {[type]}        [description]
 */
Packet.parse = function(buffer) {
  const packet = new Packet();
  const reader = new Packet.Reader(buffer);
  packet.header = Packet.Header.parse(reader);
  ([ // props             parser              count
    [ 'questions', Packet.Question, packet.header.qdcount ],
    [ 'answers', Packet.Resource, packet.header.ancount ],
    [ 'authorities', Packet.Resource, packet.header.nscount ],
    [ 'additionals', Packet.Resource, packet.header.arcount ],
  ]).forEach(function(def) {
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
  return packet;
};

/**
 * recursive
 */
Object.defineProperty(Packet.prototype, 'recursive', {
  enumerable   : true,
  configurable : true,
  get() {
    return !!this.header.rd;
  },
  set(yn) {
    this.header.rd = +yn;
    return this.header.rd;
  },
});

/**
 * [toBuffer description]
 * @return {[type]} [description]
 */
Packet.prototype.toBuffer = function(writer) {
  writer = writer || new Packet.Writer();
  this.header.qdcount = this.questions.length;
  this.header.ancount = this.answers.length;
  this.header.nscount = this.authorities.length;
  this.header.arcount = this.additionals.length;
  if (!(this instanceof Packet.Header)) { this.header = new Packet.Header(this.header); }
  this.header.toBuffer(writer);
  ([ // section          encoder
    [ 'questions', Packet.Question ],
    [ 'answers', Packet.Resource ],
    [ 'authorities', Packet.Resource ],
    [ 'additionals', Packet.Resource ],
  ]).forEach(function(def) {
    const section = def[0];
    const Encoder = def[1];
    (this[section] || []).map(function(resource) {
      return Encoder.encode(resource, writer);
    });
  }.bind(this));
  return writer.toBuffer();
};

/**
 * [Header description]
 * @param {[type]} options [description]
 * @docs https://tools.ietf.org/html/rfc1035#section-4.1.1
 */
Packet.Header = function(header) {
  this.id = 0;
  this.qr = 0;
  this.opcode = 0;
  this.aa = 0;
  this.tc = 0;
  this.rd = 0;
  this.ra = 0;
  this.z = 0;
  this.rcode = 0;
  this.qdcount = 0;
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
Packet.Header.parse = function(reader) {
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
  header.z = reader.read(3);
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
Packet.Header.prototype.toBuffer = function(writer) {
  writer = writer || new Packet.Writer();
  writer.write(this.id, 16);
  writer.write(this.qr, 1);
  writer.write(this.opcode, 4);
  writer.write(this.aa, 1);
  writer.write(this.tc, 1);
  writer.write(this.rd, 1);
  writer.write(this.ra, 1);
  writer.write(this.z, 3);
  writer.write(this.rcode, 4);
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
Packet.Question = function(name, type, cls) {
  const defaults = {
    type  : Packet.TYPE.ANY,
    class : Packet.CLASS.ANY,
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
Packet.Question.prototype.toBuffer = function(writer) {
  return Packet.Question.encode(this, writer);
};

/**
 * [parse description]
 * @param  {[type]} reader [description]
 * @return {[type]}        [description]
 */
Packet.Question.parse =
Packet.Question.decode = function(reader) {
  const question = new Packet.Question();
  if (reader instanceof Buffer) {
    reader = new Packet.Reader(reader);
  }
  question.name = Packet.Name.decode(reader);
  question.type = reader.read(16);
  question.class = reader.read(16);
  return question;
};

Packet.Question.encode = function(question, writer) {
  writer = writer || new Packet.Writer();
  Packet.Name.encode(question.name, writer);
  writer.write(question.type, 16);
  writer.write(question.class, 16);
  return writer.toBuffer();
};

/**
 * Resource record format
 * @docs https://tools.ietf.org/html/rfc1035#section-4.1.3
 */
Packet.Resource = function(name, type, cls, ttl) {
  const defaults = {
    name  : '',
    ttl   : 300,
    type  : Packet.TYPE.ANY,
    class : Packet.CLASS.ANY,
  };
  let input;
  if (typeof name === 'object') {
    input = name;
  } else {
    input = {
      name, type, class: cls, ttl,
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
Packet.Resource.prototype.toBuffer = function(writer) {
  return Packet.Resource.encode(this, writer);
};

/**
 * [encode description]
 * @param  {[type]} resource [description]
 * @param  {[type]} writer   [description]
 * @return {[type]}          [description]
 */
Packet.Resource.encode = function(resource, writer) {
  writer = writer || new Packet.Writer();
  Packet.Name.encode(resource.name, writer);
  writer.write(resource.type, 16);
  writer.write(resource.class, 16);
  writer.write(resource.ttl, 32);
  const encoder = Object.keys(Packet.TYPE).filter(function(type) {
    return resource.type === Packet.TYPE[type];
  })[0];
  if (encoder in Packet.Resource && Packet.Resource[encoder].encode) {
    return Packet.Resource[encoder].encode(resource, writer);
  } else {
    debug('node-dns > unknown encoder %s(%j)', encoder, resource.type);
  }
};
/**
 * [parse description]
 * @param  {[type]} reader [description]
 * @return {[type]}        [description]
 */
Packet.Resource.parse =
Packet.Resource.decode = function(reader) {
  if (reader instanceof Buffer) {
    reader = new Packet.Reader(reader);
  }
  let resource = new Packet.Resource();
  resource.name = Packet.Name.decode(reader);
  resource.type = reader.read(16);
  resource.class = reader.read(16);
  resource.ttl = reader.read(32);
  let length = reader.read(16);
  const parser = Object.keys(Packet.TYPE).filter(function(type) {
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
Packet.Name = {
  COPY   : 0xc0,
  decode : function(reader) {
    if (reader instanceof Buffer) {
      reader = new Packet.Reader(reader);
    }
    const name = []; let o; let len = reader.read(8);
    while (len) {
      if ((len & Packet.Name.COPY) === Packet.Name.COPY) {
        len -= Packet.Name.COPY;
        len = len << 8;
        const pos = len + reader.read(8);
        if (!o) o = reader.offset;
        reader.offset = pos * 8;
        len = reader.read(8);
        continue;
      } else {
        let part = '';
        while (len--) part += String.fromCharCode(reader.read(8));
        name.push(part);
        len = reader.read(8);
      }
    }
    if (o) reader.offset = o;
    return name.join('.');
  },
  encode: function(domain, writer) {
    writer = writer || new Packet.Writer();
    // TODO: domain name compress
    (domain || '').split('.').filter(function(part) {
      return !!part;
    }).forEach(function(part) {
      writer.write(part.length, 8);
      part.split('').map(function(c) {
        writer.write(c.charCodeAt(0), 8);
        return c.charCodeAt(0);
      });
    });
    writer.write(0, 8);
    return writer.toBuffer();
  },
};

/**
 * [A description]
 * @type {Object}
 * @docs https://tools.ietf.org/html/rfc1035#section-3.4.1
 */
Packet.Resource.A = function(address) {
  this.type = Packet.TYPE.A;
  this.class = Packet.CLASS.IN;
  this.address = address;
  return this;
};

Packet.Resource.A.encode = function(record, writer) {
  writer = writer || new Packet.Writer();
  const parts = record.address.split('.');
  writer.write(parts.length, 16);
  parts.forEach(function(part) {
    writer.write(parseInt(part, 10), 8);
  });
  return writer.toBuffer();
};

Packet.Resource.A.decode = function(reader, length) {
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
Packet.Resource.MX = function(exchange, priority) {
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
Packet.Resource.MX.encode = function(record, writer) {
  writer = writer || new Packet.Writer();
  const len = Packet.Name.encode(record.exchange).length;
  writer.write(len + 2, 16);
  writer.write(record.priority, 16);
  Packet.Name.encode(record.exchange, writer);
  return writer.toBuffer();
};
/**
 * [decode description]
 * @param  {[type]} reader [description]
 * @param  {[type]} length [description]
 * @return {[type]}        [description]
 */
Packet.Resource.MX.decode = function(reader, length) {
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
  decode: function(reader, length) {
    const parts = [];
    while (length) {
      length -= 2;
      parts.push(reader.read(16));
    }
    this.address = toIPv6(parts);
    return this;
  },
  encode: function(record, writer) {
    writer = writer || new Packet.Writer();
    const parts = fromIPv6(record.address);
    writer.write(parts.length * 2, 16);
    parts.forEach(function(part) {
      writer.write(parseInt(part, 16), 16);
    });
    return writer.toBuffer();
  },
};
/**
 * [NS description]
 * @type {Object}
 * @docs https://tools.ietf.org/html/rfc1035#section-3.3.11
 */
Packet.Resource.NS = {
  decode: function(reader, length) {
    this.ns = Packet.Name.decode(reader);
    return this;
  },
  encode: function(record, writer) {
    writer = writer || new Packet.Writer();
    writer.write(Packet.Name.encode(record.ns).length, 16);
    Packet.Name.encode(record.ns, writer);
    return writer.toBuffer();
  },
};
/**
 * [CNAME description]
 * @type {Object}
 * @docs https://tools.ietf.org/html/rfc1035#section-3.3.1
 */
Packet.Resource.PTR =
Packet.Resource.CNAME = {
  decode: function(reader, length) {
    this.domain = Packet.Name.decode(reader);
    return this;
  },
  encode: function(record, writer) {
    writer = writer || new Packet.Writer();
    writer.write(Packet.Name.encode(record.domain).length, 16);
    Packet.Name.encode(record.domain, writer);
    return writer.toBuffer();
  },
};
/**
 * [SPF description]
 * @type {[type]}
 * @docs https://tools.ietf.org/html/rfc1035#section-3.3.14
 */
Packet.Resource.SPF =
Packet.Resource.TXT = {
  decode: function(reader, length) {
    const parts = [];
    let bytesRead = 0; let chunkLength = 0;

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
  encode: function(record, writer) {
    writer = writer || new Packet.Writer();

    // make sure that resource data is a an array of strings
    const characterStrings = Array.isArray(record.data) ? record.data : [ record.data ];
    // convert array of strings to array of buffers
    const characterStringBuffers = characterStrings.map(function(characterString) {
      if (Buffer.isBuffer(characterString)) {
        return characterString;
      }
      if (typeof characterString === 'string') {
        return Buffer.from(characterString, 'utf8');
      }
      return false;
    }).filter(function(characterString) {
      // remove invalid values from the array
      return characterString;
    });

    // calculate byte length of resource strings
    const bufferLength = characterStringBuffers.reduce(function(sum, characterStringBuffer) {
      return sum + characterStringBuffer.length;
    }, 0);

    // write string length to output
    writer.write(bufferLength + characterStringBuffers.length, 16); // response length

    // write each string to output
    characterStringBuffers.forEach(function(buffer) {
      writer.write(buffer.length, 8); // text length
      buffer.forEach(function(c) {
        writer.write(c, 8);
      });
    });

    return writer.toBuffer();
  },
};
/**
 * [SOA description]
 * @type {Object}
 * @docs https://tools.ietf.org/html/rfc1035#section-3.3.13
 */
Packet.Resource.SOA = {
  decode: function(reader, length) {
    this.primary = Packet.Name.decode(reader);
    this.admin = Packet.Name.decode(reader);
    this.serial = reader.read(32);
    this.refresh = reader.read(32);
    this.retry = reader.read(32);
    this.expiration = reader.read(32);
    this.minimum = reader.read(32);
    return this;
  },
  encode: function(record, writer) {
    writer = writer || new Packet.Writer();
    let len = 0;
    len += Packet.Name.encode(record.primary).length;
    len += Packet.Name.encode(record.admin).length;
    len += (32 * 5) / 8;
    writer.write(len, 16);
    Packet.Name.encode(record.primary, writer);
    Packet.Name.encode(record.admin, writer);
    writer.write(record.serial, 32);
    writer.write(record.refresh, 32);
    writer.write(record.retry, 32);
    writer.write(record.expiration, 32);
    writer.write(record.minimum, 32);
    return writer.toBuffer();
  },
};
/**
 * [SRV description]
 * @type {Object}
 * @docs https://tools.ietf.org/html/rfc2782
 */
Packet.Resource.SRV = {
  decode: function(reader, length) {
    this.priority = reader.read(16);
    this.weight = reader.read(16);
    this.port = reader.read(16);
    this.target = Packet.Name.decode(reader);
    return this;
  },
  encode: function(record, writer) {
    writer = writer || new Packet.Writer();
    const { length } = Packet.Name.encode(record.target);
    writer.write(length + 6, 16);
    writer.write(record.priority, 16);
    writer.write(record.weight, 16);
    writer.write(record.port, 16);
    Packet.Name.encode(record.target, writer);
    return writer.toBuffer();
  },
};

Packet.Resource.EDNS = function(rdata) {
  return {
    type  : Packet.TYPE.EDNS,
    class : 512, // Supported UDP Payload size
    ttl   : 0, // Extended RCODE and flags
    rdata, // Objects of type Packet.Resource.EDNS.*
  };
};

Packet.Resource.EDNS.decode = function(reader, length) {
  this.type = Packet.TYPE.EDNS;
  this.class = 512;
  this.ttl = 0;
  this.rdata = [];

  while (length) {
    const optionCode = reader.read(16);
    const optionLength = reader.read(16); // In octet (https://tools.ietf.org/html/rfc6891#page-8)

    const decoder = Object.keys(Packet.EDNS_OPTION_CODE).filter(function(type) {
      return optionCode === Packet.EDNS_OPTION_CODE[type];
    })[0];
    if (decoder in Packet.Resource.EDNS && Packet.Resource.EDNS[decoder].decode) {
      const rdata = Packet.Resource.EDNS[decoder].decode(reader, optionLength);
      this.rdata.push(rdata);
    } else {
      reader.read(optionLength); // Ignore data that doesn't understand
      debug('node-dns > unknown EDNS rdata decoder %s(%j)', decoder, optionCode);
    }

    length = length - 4 - optionLength;
  }
  return this;
};

Packet.Resource.EDNS.encode = function(record, writer) {
  const rdataWriter = new Packet.Writer();
  for (const rdata of record.rdata) {
    const encoder = Object.keys(Packet.EDNS_OPTION_CODE).filter(function(type) {
      return rdata.ednsCode === Packet.EDNS_OPTION_CODE[type];
    })[0];
    if (encoder in Packet.Resource.EDNS && Packet.Resource.EDNS[encoder].encode) {
      const w = new Packet.Writer();
      Packet.Resource.EDNS[encoder].encode(rdata, w);
      rdataWriter.write(rdata.ednsCode, 16);
      rdataWriter.write(w.buffer.length / 8, 16);
      rdataWriter.writeBuffer(w);
    } else {
      debug('node-dns > unknown EDNS rdata encoder %s(%j)', encoder, rdata.ednsCode);
    }
  }
  writer = writer || new Packet.Writer();
  writer.write(rdataWriter.buffer.length / 8, 16);
  writer.writeBuffer(rdataWriter);
  return writer.toBuffer();
};

Packet.Resource.EDNS.ECS = function(clientIp) {
  const [ ip, prefixLength ] = clientIp.split('/');
  const numPrefixLength = parseInt(prefixLength) || 32;
  return {
    ednsCode           : Packet.EDNS_OPTION_CODE.ECS,
    family             : 1,
    sourcePrefixLength : numPrefixLength,
    scopePrefixLength  : 0,
    ip,
  };
};

Packet.Resource.EDNS.ECS.decode = function(reader, length) {
  const rdata = {};
  rdata.ednsCode = Packet.EDNS_OPTION_CODE.ECS;
  rdata.family = reader.read(16);
  rdata.sourcePrefixLength = reader.read(8);
  rdata.scopePrefixLength = reader.read(8);
  length -= 4;

  if (rdata.family !== 1) {
    debug('node-dns > unimplemented address family');
    reader.read(length * 8); // Ignore data that doesn't understand
    return rdata;
  }

  const ipv4Octets = [];
  while (length--) {
    const octet = reader.read(8);
    ipv4Octets.push(octet);
  }
  while (ipv4Octets.length < 4) {
    ipv4Octets.push(0);
  }
  rdata.ip = ipv4Octets.join('.');
  return rdata;
};

Packet.Resource.EDNS.ECS.encode = function(record, writer) {
  const ip = record.ip.split('.').map(s => parseInt(s));
  writer.write(record.family, 16);
  writer.write(record.sourcePrefixLength, 8);
  writer.write(record.scopePrefixLength, 8);
  writer.write(ip[0], 8);
  writer.write(ip[1], 8);
  writer.write(ip[2], 8);
  writer.write(ip[3], 8);
};

Packet.Resource.CAA = {
  encode: function(record, writer) {
    writer = writer || new Packet.Writer();

    const buffer = Buffer.from(record.tag + record.value, 'utf8');
    writer.write(2 + buffer.length, 16);
    writer.write(record.flags, 8);
    writer.write(record.tag.length, 8);

    buffer.forEach(function(c) {
      writer.write(c, 8);
    });
    return writer.toBuffer();
  },
};

Packet.Reader = BufferReader;
Packet.Writer = BufferWriter;

Packet.createResponseFromRequest = function(request) {
  const response = new Packet(request);
  response.header.qr = 1;
  response.additionals = [];
  return response;
};

Packet.createResourceFromQuestion = function(base, record) {
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
          chunks = [ Buffer.concat(chunks, chunklen) ];
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
Packet.prototype.toBase64URL = function() {
  const buffer = this.toBuffer();
  const base64 = buffer.toString('base64');
  return base64
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
};

module.exports = Packet;
module.exports.toIPv6 = toIPv6;
module.exports.fromIPv6 = fromIPv6;
