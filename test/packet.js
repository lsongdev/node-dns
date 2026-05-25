const assert = require('node:assert');
const test = require('./test');
const { Packet } = require('..');

const response = Buffer.from([
  0x29, 0x64, 0x81, 0x80, 0x00, 0x01, 0x00, 0x01,
  0x00, 0x00, 0x00, 0x00, 0x03, 0x77, 0x77, 0x77,
  0x01, 0x7a, 0x02, 0x63, 0x6e, 0x00, 0x00, 0x01,
  0x00, 0x01, 0xc0, 0x0c, 0x00, 0x01, 0x00, 0x01,
  0x00, 0x00, 0x01, 0x90, 0x00, 0x04, 0x36, 0xde,
  0x3c, 0xfc ]);

test('Name#encode', function() {
  const name = Packet.Name.encode('www.google.com');
  const pattern = [ 3, 'w', 'w', 'w', 5, 'g', 'o', 'o', 'g', 'l', 'e', 3, 'c', 'o', 'm', '0' ];
  assert.equal(name.length, pattern.length);
});

test('Name#decode', function() {
  const reader = new Packet.Reader(response, 8 * 12);
  let name = Packet.Name.decode(reader);
  assert.equal(name, 'www.z.cn');

  reader.offset = 8 * 26;
  name = Packet.Name.decode(reader);
  assert.equal(reader.offset, 8 * 28);
  assert.equal(name, 'www.z.cn');
});

test('Header#encode', function() {
  const header = new Packet.Header({ id: 0x2964, qr: 1 });
  header.qdcount = 1;
  header.ancount = 2;
  assert.deepEqual(header.toBuffer(), Buffer.from([
    0x29, 0x64, 0x80, 0x00, 0x00, 0x01, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00 ]));
});

test('Header#parse', function() {
  const header = Packet.Header.parse(response);
  assert.equal(header.id, 0x2964);
  assert.equal(header.qr, 1);
  assert.equal(header.opcode, 0);
  assert.equal(header.aa, 0);
  assert.equal(header.tc, 0);
  assert.equal(header.rd, 1);
  assert.equal(header.z, 0);
  assert.equal(header.rcode, 0);
  assert.equal(header.qdcount, 1);
  assert.equal(header.ancount, 1);
  assert.equal(header.nscount, 0);
  assert.equal(header.arcount, 0);
});

test('Question#encode', function() {
  const question = new Packet.Question({
    name  : 'google.com',
    type  : Packet.TYPE.A,
    class : Packet.CLASS.IN,
  });
  //
  assert.deepEqual(question.toBuffer(), Buffer.from([
    0x06, 0x67, 0x6f, 0x6f, 0x67, 0x6c, 0x65, 0x03,
    0x63, 0x6f, 0x6d, 0x00, 0x00, 0x01, 0x00, 0x01,
  ]));
});

test('Question#decode', function() {
  const question = new Packet.Question('google.com',
    Packet.TYPE.A, Packet.CLASS.IN);
  assert.deepEqual(question.toBuffer(), Buffer.from([
    0x06, 0x67, 0x6f, 0x6f, 0x67, 0x6c, 0x65, 0x03,
    0x63, 0x6f, 0x6d, 0x00, 0x00, 0x01, 0x00, 0x01,
  ]));
});

//
test('Package#toIPv6', function() {
  assert.equal(Packet.toIPv6([ 10756, 20034, 512, 0, 0, 0, 0, 803 ]), '2a04:4e42:200::323');
  assert.equal(Packet.toIPv6([ 10755, 45248, 3, 208, 0, 0, 5057, 61441 ]), '2a03:b0c0:3:d0::13c1:f001');
  assert.equal(Packet.toIPv6([ 10752, 5200, 16387, 2055, 0, 0, 0, 8206 ]), '2a00:1450:4003:807::200e');
  assert.equal(Packet.toIPv6([ 9734, 18176, 12552, 0, 0, 0, 44098, 10984 ]), '2606:4700:3108::ac42:2ae8');
});

test('Package#fromIPv6', function() {
  assert.deepEqual(Packet.fromIPv6('2a04:4e42:200::323'), [
    '2a04', '4e42', '0200', '0', '0', '0', '0', '0323' ]);
  assert.deepEqual(Packet.fromIPv6('2a03:b0c0:3:d0::13c1:f001'), [ '2a03', 'b0c0', '0003', '00d0', '0', '0', '13c1', 'f001' ]);
  assert.deepEqual(Packet.fromIPv6('2a00:1450:4003:807::200e'), [ '2a00', '1450', '4003', '0807', '0', '0', '0', '200e' ]);
  assert.deepEqual(Packet.fromIPv6('2606:4700:3108::ac42:2ae8'), [ '2606', '4700', '3108', '0', '0', '0', 'ac42', '2ae8' ]);
  assert.deepEqual(Packet.fromIPv6('::'), [ '0', '0', '0', '0', '0', '0', '0', '0' ]);
  assert.deepEqual(Packet.fromIPv6('::2606:4700:3108'), [ '0', '0', '0', '0', '0', '2606', '4700', '3108' ]);
  assert.deepEqual(Packet.fromIPv6('606:4700:3108::'), [ '0606', '4700', '3108', '0', '0', '0', '0', '0' ]);
});

test('Packet#parse', function() {
  const packet = Packet.parse(response);
  assert.equal(packet.questions[0].name, 'www.z.cn');
  assert.equal(packet.questions[0].type, Packet.TYPE.A);
  assert.equal(packet.questions[0].class, Packet.CLASS.IN);
  assert.equal(packet.answers[0].class, Packet.TYPE.A);
  assert.equal(packet.answers[0].class, Packet.CLASS.IN);
  assert.equal(packet.answers[0].address, '54.222.60.252');
});

test('Packet#encode', function() {
  const response = new Packet();
  //
  response.header.qr = 1;
  response.answers.push({
    name    : 'lsong.org',
    type    : Packet.TYPE.A,
    class   : Packet.CLASS.IN,
    ttl     : 300,
    address : '127.0.0.1',
  });

  response.answers.push({
    name    : 'lsong.org',
    type    : Packet.TYPE.AAAA,
    class   : Packet.CLASS.IN,
    ttl     : 300,
    address : '2001:db8::ff00:42:8329',
  });

  response.answers.push({
    name   : 'lsong.org',
    type   : Packet.TYPE.CNAME,
    class  : Packet.CLASS.IN,
    ttl    : 300,
    domain : 'sfo1.lsong.org',
  });

  response.answers.push({
    name   : 'lsong.org',
    type   : Packet.TYPE.PTR,
    class  : Packet.CLASS.IN,
    ttl    : 300,
    domain : 'sfo1.lsong.org',
  });

  // DNS KEY
  response.answers.push({
    name      : 'lsong.org',
    ttl       : 300,
    type      : 48,
    class     : 1,
    flags     : 256,
    protocol  : 3,
    algorithm : 13,
    keyTag    : 1721,
    zoneKey   : true,
    zoneSep   : false,
    key       : 'PM8S6PI0Gf8d3HK9gHSVpW3X3zeieMEa+PLCijFuaFgiIANdUQen5xNn0/9+eo3E4VIJGU27lk6q4xXqMuQl7A==',
  });

  response.authorities.push({
    name     : 'lsong.org',
    type     : Packet.TYPE.MX,
    class    : Packet.CLASS.IN,
    ttl      : 300,
    exchange : 'mail.lsong.org',
    priority : 5,
  });

  response.authorities.push({
    name  : 'lsong.org',
    type  : Packet.TYPE.NS,
    class : Packet.CLASS.IN,
    ttl   : 300,
    ns    : 'ns1.lsong.org',
  });

  response.additionals.push({
    name       : 'lsong.org',
    type       : Packet.TYPE.SOA,
    class      : Packet.CLASS.IN,
    ttl        : 300,
    primary    : 'lsong.org',
    admin      : 'admin@lsong.org',
    serial     : 2016121301,
    refresh    : 300,
    retry      : 3,
    expiration : 10,
    minimum    : 10,
  });
  //
  response.additionals.push({
    name  : 'lsong.org',
    type  : Packet.TYPE.TXT,
    class : Packet.CLASS.IN,
    ttl   : 300,
    data  : '#v=spf1 include:_spf.google.com ~all',
  });

  assert.deepEqual(Packet.parse(response.toBuffer()), response);
});

test('Packet#encode array of character strings', function() {
  const response = new Packet();
  //
  const dkim = [ 'v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAsD6Th73ZDKkFAntNZDbx',
    'Eh8VV2DSMs3re6v9/gXoT3dGcbSsuUMpfLzP5MWp4sW5cPyZxEGSiC03ZVIcCca0GRAuX9b1M0Qy25wLmPq',
    '8eT129mhwbeX50xTaXqq63A/oDM0QOPe1IeBMfPnR9tWXxvEzZKvVbmTlMY5bf+3QHLqmaEihnGlXh2LRVZ',
    'be2EMlYo18YM4LU/LkZKe06rxlq38W22TL7964tr7jmOZ+huXf2iLSg4nc4UzLwb2aOdOA+w4c87h+HW/L8',
    '0548pFguF46TKc0C0egZ+oll3Y8zySYrbkVrWFrcpnrw5qDiRVHEjxqZSubSYX+16TjNcJg9QIDAQAB' ];

  response.header.qr = 1;
  response.answers.push({
    name  : 'lsong.org',
    type  : Packet.TYPE.TXT,
    class : Packet.CLASS.IN,
    ttl   : 300,
    data  : dkim,
  });

  assert.equal(Packet.parse(response.toBuffer()).answers[0].data, dkim.join(''));
});

test('EDNS.ECS#encode', function() {
  const query = new Packet.Resource.EDNS([
    new Packet.Resource.EDNS.ECS('10.11.12.13/24'),
  ]);

  const b = Packet.Resource.encode(query);
  assert.deepEqual(b, Buffer.from([
    0x00, 0x00, 0x29, 0x02, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x0c, 0x00, 0x08, 0x00, 0x08, 0x00,
    0x01, 0x18, 0x00, 0x0a, 0x0b, 0x0c, 0x0d ]));
});

test('EDNS#decode', function() {
  const buffer = Buffer.from([ 0x00, 0x08, 0x00, 0x08, 0x00, 0x01, 0x18, 0x00, 0x0a, 0x0b, 0x0c, 0x0d ]);
  const reader = new Packet.Reader(buffer);
  const record = Packet.Resource.EDNS.decode(reader, buffer.length);

  assert.equal(record.rdata.length, 1);
  assert.equal(record.rdata[0].ednsCode, 8);
  assert.equal(record.rdata[0].family, 1);
  assert.equal(record.rdata[0].sourcePrefixLength, 24);
  assert.equal(record.rdata[0].scopePrefixLength, 0);
  assert.equal(record.rdata[0].ip, '10.11.12.13');

  const query = new Packet.Resource.EDNS([
    new Packet.Resource.EDNS.ECS('10.20.0.0/16'),
  ]);
  const encoded = Packet.Resource.encode(query);
  const decoded = Packet.Resource.decode(encoded);
  delete decoded.name;

  assert.deepEqual(decoded, query);
});

test('EDNS#decode multiple', function() {
  const query = new Packet.Resource.EDNS([
    new Packet.Resource.EDNS.ECS('10.0.0.0/8'),
    new Packet.Resource.EDNS.ECS('10.9.0.0/16'),
    new Packet.Resource.EDNS.ECS('10.9.8.0/24'),
    new Packet.Resource.EDNS.ECS('10.9.8.7/32'),
  ]);
  const encoded = Packet.Resource.encode(query);
  const decoded = Packet.Resource.decode(encoded);
  delete decoded.name;

  assert.deepEqual(decoded, query);
});

// Helper: serialize a single answer and parse it back to verify round-trip integrity.
function roundTripAnswer(answer) {
  const packet = new Packet();
  packet.header.qr = 1;
  packet.answers.push(answer);
  const parsed = Packet.parse(packet.toBuffer());
  return parsed.answers[0];
}

test('Resource#A round-trip', function() {
  const out = roundTripAnswer({
    name    : 'a.example.com',
    type    : Packet.TYPE.A,
    class   : Packet.CLASS.IN,
    ttl     : 60,
    address : '203.0.113.42',
  });
  assert.equal(out.name, 'a.example.com');
  assert.equal(out.type, Packet.TYPE.A);
  assert.equal(out.class, Packet.CLASS.IN);
  assert.equal(out.ttl, 60);
  assert.equal(out.address, '203.0.113.42');
});

test('Resource#AAAA round-trip preserves compressed form', function() {
  const out = roundTripAnswer({
    name    : 'v6.example.com',
    type    : Packet.TYPE.AAAA,
    class   : Packet.CLASS.IN,
    ttl     : 300,
    address : '2001:db8::1',
  });
  assert.equal(out.type, Packet.TYPE.AAAA);
  // toIPv6 normalizes, so we compare against the normalized form
  assert.equal(out.address, '2001:db8::1');
});

test('Resource#CNAME round-trip', function() {
  const out = roundTripAnswer({
    name   : 'alias.example.com',
    type   : Packet.TYPE.CNAME,
    class  : Packet.CLASS.IN,
    ttl    : 3600,
    domain : 'canonical.example.com',
  });
  assert.equal(out.domain, 'canonical.example.com');
});

test('Resource#PTR round-trip', function() {
  const out = roundTripAnswer({
    name   : '1.0.0.127.in-addr.arpa',
    type   : Packet.TYPE.PTR,
    class  : Packet.CLASS.IN,
    ttl    : 86400,
    domain : 'localhost',
  });
  assert.equal(out.domain, 'localhost');
});

test('Resource#NS round-trip', function() {
  const out = roundTripAnswer({
    name  : 'example.com',
    type  : Packet.TYPE.NS,
    class : Packet.CLASS.IN,
    ttl   : 172800,
    ns    : 'ns1.example.com',
  });
  assert.equal(out.ns, 'ns1.example.com');
});

test('Resource#MX round-trip', function() {
  const out = roundTripAnswer({
    name     : 'example.com',
    type     : Packet.TYPE.MX,
    class    : Packet.CLASS.IN,
    ttl      : 300,
    exchange : 'mail.example.com',
    priority : 10,
  });
  assert.equal(out.exchange, 'mail.example.com');
  assert.equal(out.priority, 10);
});

test('Resource#SRV round-trip', function() {
  const out = roundTripAnswer({
    name     : '_sip._tcp.example.com',
    type     : Packet.TYPE.SRV,
    class    : Packet.CLASS.IN,
    ttl      : 300,
    priority : 10,
    weight   : 60,
    port     : 5060,
    target   : 'sipserver.example.com',
  });
  assert.equal(out.priority, 10);
  assert.equal(out.weight, 60);
  assert.equal(out.port, 5060);
  assert.equal(out.target, 'sipserver.example.com');
});

test('Resource#TXT round-trip single string', function() {
  const out = roundTripAnswer({
    name  : 'example.com',
    type  : Packet.TYPE.TXT,
    class : Packet.CLASS.IN,
    ttl   : 300,
    data  : 'hello world',
  });
  assert.equal(out.data, 'hello world');
});

test('Resource#TXT round-trip with utf-8', function() {
  const out = roundTripAnswer({
    name  : 'example.com',
    type  : Packet.TYPE.TXT,
    class : Packet.CLASS.IN,
    ttl   : 300,
    data  : 'café résumé 日本',
  });
  assert.equal(out.data, 'café résumé 日本');
});

test('Resource#SOA round-trip', function() {
  const out = roundTripAnswer({
    name       : 'example.com',
    type       : Packet.TYPE.SOA,
    class      : Packet.CLASS.IN,
    ttl        : 3600,
    primary    : 'ns1.example.com',
    admin      : 'hostmaster.example.com',
    serial     : 2024010101,
    refresh    : 7200,
    retry      : 3600,
    expiration : 1209600,
    minimum    : 86400,
  });
  assert.equal(out.primary, 'ns1.example.com');
  assert.equal(out.admin, 'hostmaster.example.com');
  assert.equal(out.serial, 2024010101);
  assert.equal(out.refresh, 7200);
  assert.equal(out.retry, 3600);
  assert.equal(out.expiration, 1209600);
  assert.equal(out.minimum, 86400);
});

test('Resource#DNSKEY round-trip preserves keyTag and flags', function() {
  const out = roundTripAnswer({
    name      : 'example.com',
    type      : Packet.TYPE.DNSKEY,
    class     : Packet.CLASS.IN,
    ttl       : 3600,
    flags     : 257,
    protocol  : 3,
    algorithm : 8,
    key       : 'AwEAAdHoNTOW+et86KuJOWRD3iY/HsZ6dQ4FFNS1Z+0DxiAk7BWv',
  });
  assert.equal(out.flags, 257);
  assert.equal(out.protocol, 3);
  assert.equal(out.algorithm, 8);
  assert.equal(out.key, 'AwEAAdHoNTOW+et86KuJOWRD3iY/HsZ6dQ4FFNS1Z+0DxiAk7BWv');
  assert.equal(out.zoneKey, true); // bit 7 of flags=257 (0x101) is set
  assert.equal(out.zoneSep, true); // bit 15 of flags=257 (0x101) is set
  assert.ok(typeof out.keyTag === 'number');
});

test('Resource#CAA encode produces correct wire bytes', function() {
  // CAA only has an encoder in this library; verify the rdata layout directly.
  const writer = new Packet.Writer();
  Packet.Resource.CAA.encode({
    flags : 0,
    tag   : 'issue',
    value : 'letsencrypt.org',
  }, writer);
  const buffer = writer.toBuffer();
  // Layout: [ rdlength_hi, rdlength_lo, flags, tagLen, tag..., value... ]
  const rdlength = buffer.readUInt16BE(0);
  assert.equal(rdlength, 2 + 'issue'.length + 'letsencrypt.org'.length);
  assert.equal(buffer[2], 0); // flags
  assert.equal(buffer[3], 'issue'.length); // tag length
  assert.equal(buffer.slice(4, 4 + 5).toString(), 'issue');
  assert.equal(buffer.slice(4 + 5).toString(), 'letsencrypt.org');
});

test('EDNS.ECS#decode family=2 (IPv6)', function() {
  // Hand-built rdata for ECS with IPv6 family covering "2001:db8::/32"
  // (4 bytes of address: 0x20 0x01 0x0d 0xb8). Format:
  //   family(16=0x0002) | srcPrefix(8=32) | scopePrefix(8=0) | addr bytes
  const buffer = Buffer.from([
    0x00, 0x02, 0x20, 0x00, 0x20, 0x01, 0x0d, 0xb8,
  ]);
  const reader = new Packet.Reader(buffer);
  const rdata = Packet.Resource.EDNS.ECS.decode(reader, buffer.length);
  assert.equal(rdata.family, 2);
  assert.equal(rdata.sourcePrefixLength, 32);
  assert.equal(rdata.scopePrefixLength, 0);
  assert.equal(rdata.ip, '2001:db8:0:0:0:0:0:0');
});

test('Packet#toBase64URL is reversible', function() {
  const packet = new Packet();
  packet.header.id = 0x1234;
  packet.header.rd = 1;
  packet.questions.push({ name: 'example.com', type: Packet.TYPE.A, class: Packet.CLASS.IN });
  const url = packet.toBase64URL();
  // No padding, no '+' or '/'
  assert.ok(!/[+/=]/.test(url));
  const restored = Buffer.from(url.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const parsed = Packet.parse(restored);
  assert.equal(parsed.header.id, 0x1234);
  assert.equal(parsed.header.rd, 1);
  assert.equal(parsed.questions[0].name, 'example.com');
  assert.equal(parsed.questions[0].type, Packet.TYPE.A);
});

test('Packet.createResponseFromRequest sets qr=1 and clears additionals', function() {
  const request = new Packet();
  request.header.id = 0xabcd;
  request.header.rd = 1;
  request.questions.push({ name: 'foo.test', type: Packet.TYPE.A, class: Packet.CLASS.IN });
  request.additionals.push({ name: 'foo.test', type: Packet.TYPE.A, class: 1, ttl: 1, address: '1.1.1.1' });

  const response = Packet.createResponseFromRequest(request);
  assert.equal(response.header.qr, 1);
  assert.equal(response.header.id, 0xabcd);
  assert.deepEqual(response.questions, request.questions);
  assert.deepEqual(response.additionals, []);
});

test('Packet.createResourceFromQuestion copies name and applies record fields', function() {
  const question = { name: 'svc.example.com', type: Packet.TYPE.A, class: Packet.CLASS.IN };
  const resource = Packet.createResourceFromQuestion(question, {
    ttl     : 120,
    address : '198.51.100.7',
  });
  assert.equal(resource.name, 'svc.example.com');
  assert.equal(resource.type, Packet.TYPE.A);
  assert.equal(resource.class, Packet.CLASS.IN);
  assert.equal(resource.ttl, 120);
  assert.equal(resource.address, '198.51.100.7');
});

test('Packet#recursive getter/setter mirrors header.rd', function() {
  const packet = new Packet();
  assert.equal(packet.recursive, false);
  packet.recursive = true;
  assert.equal(packet.header.rd, 1);
  assert.equal(packet.recursive, true);
  packet.recursive = false;
  assert.equal(packet.header.rd, 0);
  assert.equal(packet.recursive, false);
});

test('Packet constructor accepts string as question name', function() {
  const packet = new Packet('lookup.example');
  assert.equal(packet.questions.length, 1);
  assert.equal(packet.questions[0], 'lookup.example');
});

test('Packet constructor accepts array of questions', function() {
  const questions = [
    { name: 'a.test', type: Packet.TYPE.A, class: Packet.CLASS.IN },
    { name: 'b.test', type: Packet.TYPE.AAAA, class: Packet.CLASS.IN },
  ];
  const packet = new Packet(questions);
  assert.deepEqual(packet.questions, questions);
});

test('Packet constructor accepts Header instance', function() {
  const header = new Packet.Header({ id: 0x5555, qr: 1 });
  const packet = new Packet(header);
  assert.equal(packet.header.id, 0x5555);
  assert.equal(packet.header.qr, 1);
});

test('Reader.read at non-byte-aligned offsets', function() {
  // Buffer: 0b10110010 0b01101100 = 0xB2 0x6C
  // Read 3 bits → 101 = 5
  // Read 5 bits → 10010 = 18
  // Read 4 bits → 0110 = 6
  // Read 4 bits → 1100 = 12
  const reader = new Packet.Reader(Buffer.from([ 0xB2, 0x6C ]));
  assert.equal(reader.read(3), 5);
  assert.equal(reader.read(5), 18);
  assert.equal(reader.read(4), 6);
  assert.equal(reader.read(4), 12);
});

test('Writer→Reader round-trip at byte-aligned widths', function() {
  const writer = new Packet.Writer();
  writer.write(0x12, 8);
  writer.write(0xABCD, 16);
  writer.write(0xDEADBEEF, 32);
  const buffer = writer.toBuffer();
  assert.equal(buffer.length, 7);
  const reader = new Packet.Reader(buffer);
  assert.equal(reader.read(8), 0x12);
  assert.equal(reader.read(16), 0xABCD);
  assert.equal(reader.read(32), 0xDEADBEEF);
});

test('Writer→Reader header-shape bitfield round-trip', function() {
  // Mirrors Packet.Header layout: 16+1+4+1+1+1+1+3+4 = 32 bits
  const writer = new Packet.Writer();
  writer.write(0xCAFE, 16);
  writer.write(1, 1); // qr
  writer.write(0, 4); // opcode
  writer.write(1, 1); // aa
  writer.write(0, 1); // tc
  writer.write(1, 1); // rd
  writer.write(1, 1); // ra
  writer.write(0, 3); // z
  writer.write(2, 4); // rcode
  const buffer = writer.toBuffer();
  assert.equal(buffer.length, 4);
  const reader = new Packet.Reader(buffer);
  assert.equal(reader.read(16), 0xCAFE);
  assert.equal(reader.read(1), 1);
  assert.equal(reader.read(4), 0);
  assert.equal(reader.read(1), 1);
  assert.equal(reader.read(1), 0);
  assert.equal(reader.read(1), 1);
  assert.equal(reader.read(1), 1);
  assert.equal(reader.read(3), 0);
  assert.equal(reader.read(4), 2);
});

test('Packet.Name encode/decode round-trip handles long labels', function() {
  // 63 chars is the max single-label length per RFC 1035
  const label = 'a'.repeat(63);
  const name = `${label}.example.com`;
  const writer = new Packet.Writer();
  Packet.Name.encode(name, writer);
  const reader = new Packet.Reader(writer.toBuffer());
  assert.equal(Packet.Name.decode(reader), name);
});

test('Packet.Name encode filters empty labels (trailing dot)', function() {
  // Trailing dot is canonical in DNS but the encoder drops empty parts.
  const a = Packet.Name.encode('example.com.');
  const b = Packet.Name.encode('example.com');
  assert.deepEqual(a, b);
});

test('Resource#CAA round-trip via Packet.parse', function() {
  const packet = new Packet();
  packet.header.qr = 1;
  packet.answers.push({
    name  : 'example.com',
    type  : Packet.TYPE.CAA,
    class : Packet.CLASS.IN,
    ttl   : 300,
    flags : 0,
    tag   : 'issue',
    value : 'letsencrypt.org',
  });
  const parsed = Packet.parse(packet.toBuffer());
  assert.equal(parsed.answers.length, 1);
  assert.equal(parsed.answers[0].flags, 0);
  assert.equal(parsed.answers[0].tag, 'issue');
  assert.equal(parsed.answers[0].value, 'letsencrypt.org');
});

test('Packet.createResponseFromRequest does not mutate request', function() {
  const request = new Packet();
  request.header.id = 0x1234;
  request.questions.push({ name: 'x.test', type: Packet.TYPE.A, class: Packet.CLASS.IN });
  request.additionals.push({
    name: 'opt', type: Packet.TYPE.EDNS, class: 512, ttl: 0, rdata: [],
  });
  const originalAdditionalsLength = request.additionals.length;
  const originalQr = request.header.qr;
  const response = Packet.createResponseFromRequest(request);
  assert.notStrictEqual(response, request, 'response should be a distinct object');
  assert.equal(request.header.qr, originalQr, 'request.header.qr should not be mutated');
  assert.equal(request.additionals.length, originalAdditionalsLength,
    'request.additionals should not be cleared');
});

test('Reader.read across non-aligned multi-byte offsets', function() {
  // 0xAB=10101011, 0xCD=11001101, 0xEF=11101111
  // After consuming 4 bits, bits 4-19 are: 1011 11001101 1110 = 0xBCDE
  const reader = new Packet.Reader(Buffer.from([ 0xAB, 0xCD, 0xEF ]));
  assert.equal(reader.read(4), 0xA);
  assert.equal(reader.read(16), 0xBCDE);
});

test('Packet.RCODE contains all standard error codes', function() {
  assert.equal(Packet.RCODE.NOERROR, 0);
  assert.equal(Packet.RCODE.FORMERR, 1);
  assert.equal(Packet.RCODE.SERVFAIL, 2);
  assert.equal(Packet.RCODE.NXDOMAIN, 3);
  assert.equal(Packet.RCODE.NOTIMP, 4);
  assert.equal(Packet.RCODE.REFUSED, 5);
});

test('Packet.RCODE is preserved through encode/parse round-trip', function() {
  for (const [ name, code ] of Object.entries(Packet.RCODE)) {
    const pkt = new Packet();
    pkt.header.id = 0x1234;
    pkt.header.qr = 1;
    pkt.header.rcode = code;
    const parsed = Packet.parse(pkt.toBuffer());
    assert.equal(parsed.header.rcode, code,
      `RCODE.${name} (${code}) did not survive encode→parse`);
  }
});

test('Resource encode round-trips unknown type via raw data fallback', function() {
  // C1 (AUDIT-RFC.md): the encoder must write RDLENGTH+RDATA for types it
  // doesn't know how to serialize, otherwise the wire format is truncated.
  // 0xABCD is intentionally not in Packet.TYPE.
  const rdata = Buffer.from([ 0xDE, 0xAD, 0xBE, 0xEF, 0x00, 0x01 ]);
  const packet = new Packet();
  packet.header.qr = 1;
  packet.answers.push({
    name  : 'unknown.example',
    type  : 0xABCD,
    class : Packet.CLASS.IN,
    ttl   : 60,
    data  : rdata,
  });
  const parsed = Packet.parse(packet.toBuffer());
  assert.equal(parsed.answers.length, 1);
  assert.equal(parsed.answers[0].type, 0xABCD);
  assert.equal(parsed.answers[0].class, Packet.CLASS.IN);
  assert.equal(parsed.answers[0].ttl, 60);
  assert.ok(Buffer.isBuffer(parsed.answers[0].data));
  assert.deepEqual(parsed.answers[0].data, rdata);
});

test('Resource encode of unknown type does not corrupt following records', function() {
  // The strongest signal for the C1 fix: without it, the missing RDLENGTH
  // would make the parser interpret the next record's bytes as RDATA, and
  // the A record below would never appear in `answers`.
  const packet = new Packet();
  packet.header.qr = 1;
  packet.answers.push({
    name  : 'unknown.example',
    type  : 0xABCD,
    class : Packet.CLASS.IN,
    ttl   : 60,
    data  : Buffer.from([ 0x01, 0x02, 0x03 ]),
  });
  packet.answers.push({
    name    : 'after.example',
    type    : Packet.TYPE.A,
    class   : Packet.CLASS.IN,
    ttl     : 30,
    address : '203.0.113.9',
  });
  const parsed = Packet.parse(packet.toBuffer());
  assert.equal(parsed.answers.length, 2);
  assert.equal(parsed.answers[0].type, 0xABCD);
  assert.equal(parsed.answers[1].type, Packet.TYPE.A);
  assert.equal(parsed.answers[1].name, 'after.example');
  assert.equal(parsed.answers[1].address, '203.0.113.9');
});

test('Resource encode of unknown type with no data writes empty RDATA', function() {
  // When an unknown-type record has no `data`, encode should still emit a
  // valid RDLENGTH=0 block so the packet remains parseable.
  const packet = new Packet();
  packet.header.qr = 1;
  packet.answers.push({
    name  : 'bare.example',
    type  : 0xABCD,
    class : Packet.CLASS.IN,
    ttl   : 0,
  });
  packet.answers.push({
    name    : 'follow.example',
    type    : Packet.TYPE.A,
    class   : Packet.CLASS.IN,
    ttl     : 30,
    address : '198.51.100.1',
  });
  const parsed = Packet.parse(packet.toBuffer());
  assert.equal(parsed.answers.length, 2);
  assert.equal(parsed.answers[0].type, 0xABCD);
  assert.equal(parsed.answers[0].data.length, 0);
  assert.equal(parsed.answers[1].address, '198.51.100.1');
});

test('Packet.parse tolerates multiple questions', function() {
  const request = new Packet();
  request.header.id = 0x9999;
  request.questions.push({ name: 'one.test', type: Packet.TYPE.A, class: Packet.CLASS.IN });
  request.questions.push({ name: 'two.test', type: Packet.TYPE.AAAA, class: Packet.CLASS.IN });
  const parsed = Packet.parse(request.toBuffer());
  assert.equal(parsed.header.qdcount, 2);
  assert.equal(parsed.questions.length, 2);
  assert.equal(parsed.questions[0].name, 'one.test');
  assert.equal(parsed.questions[0].type, Packet.TYPE.A);
  assert.equal(parsed.questions[1].name, 'two.test');
  assert.equal(parsed.questions[1].type, Packet.TYPE.AAAA);
});
