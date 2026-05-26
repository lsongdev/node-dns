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

test('Package#toIPv6 RFC 5952 — leading-zero addresses', function() {
  assert.equal(Packet.toIPv6([ 0, 0, 0, 0, 0, 0, 0, 1 ]), '::1');
  assert.equal(Packet.toIPv6([ 0, 0, 0, 0, 0, 0, 0, 0 ]), '::');
  assert.equal(Packet.toIPv6([ 0, 0, 0, 0, 0, 0xffff, 0xc000, 0x0201 ]), '::ffff:c000:201');
});

test('Package#toIPv6 RFC 5952 — trailing-zero addresses', function() {
  assert.equal(Packet.toIPv6([ 1, 0, 0, 0, 0, 0, 0, 0 ]), '1::');
  assert.equal(Packet.toIPv6([ 0x2001, 0xdb8, 0, 0, 0, 0, 0, 0 ]), '2001:db8::');
});

test('Package#toIPv6 RFC 5952 — single zero group is not compressed', function() {
  // §4.2.2: "::" MUST NOT be used to shorten just one 16-bit 0 field.
  assert.equal(Packet.toIPv6([ 1, 0, 1, 1, 1, 1, 1, 1 ]), '1:0:1:1:1:1:1:1');
});

test('Package#toIPv6 RFC 5952 — first run wins on tie', function() {
  // §4.2.3: when there is more than one run of equal maximum length,
  // the first is shortened.
  assert.equal(Packet.toIPv6([ 1, 0, 0, 1, 0, 0, 1, 1 ]), '1::1:0:0:1:1');
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

  // RFC 7871 §6: ADDRESS field is only ceil(sourcePrefixLength/8) octets,
  // so /24 writes 3 address bytes (10.11.12), not 4.
  // class=0x1000=4096 is the RFC 6891 §6.2.5 default UDP payload size.
  const b = Packet.Resource.encode(query);
  assert.deepEqual(b, Buffer.from([
    0x00, 0x00, 0x29, 0x10, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x0b, 0x00, 0x08, 0x00, 0x07, 0x00,
    0x01, 0x18, 0x00, 0x0a, 0x0b, 0x0c ]));
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
  // RDLENGTH is owned by Packet.Resource.encode now (so it can back-fill the
  // value after compression), and is not emitted by per-type encoders.
  const writer = new Packet.Writer();
  Packet.Resource.CAA.encode({
    flags : 0,
    tag   : 'issue',
    value : 'letsencrypt.org',
  }, writer);
  const buffer = writer.toBuffer();
  // Layout (rdata only): [ flags, tagLen, tag..., value... ]
  assert.equal(buffer[0], 0); // flags
  assert.equal(buffer[1], 'issue'.length); // tag length
  assert.equal(buffer.slice(2, 2 + 5).toString(), 'issue');
  assert.equal(buffer.slice(2 + 5).toString(), 'letsencrypt.org');
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
  // the encoder must write RDLENGTH+RDATA for types it doesn't know how
  // to serialize, else the wire format is truncated.
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
  // without the fix, the missing RDLENGTH would make the parser interpret the
  // next record's bytes as RDATA, and the A record would never appear in `answers`.
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

test('Packet.uuid returns a 16-bit integer', function() {
  // must use the full 16-bit space, not Math.random()*1e5.
  for (let i = 0; i < 1000; i++) {
    const id = Packet.uuid();
    assert.ok(Number.isInteger(id), `not an integer: ${id}`);
    assert.ok(id >= 0 && id <= 0xFFFF, `out of range: ${id}`);
  }
});

test('Packet.uuid exercises the full 16-bit range with high diversity', function() {
  // Sample size large enough that a CSPRNG over [0, 0xFFFF] almost certainly
  // produces values in every quartile of the range. Catches regressions to a
  // constant, low-entropy, or capped implementation.
  const samples = new Set();
  const quartile = [ 0, 0, 0, 0 ];
  for (let i = 0; i < 5000; i++) {
    const id = Packet.uuid();
    samples.add(id);
    quartile[Math.floor((id / 0x10000) * 4)]++;
  }
  assert.ok(samples.size > 4000, `expected high diversity, got ${samples.size}`);
  for (let q = 0; q < 4; q++) {
    assert.ok(quartile[q] > 200, `quartile ${q} underrepresented (${quartile[q]}/5000)`);
  }
});

test('Name decode rejects a pointer cycle (no infinite loop)', function() {
  // Hand-built packet header (12 bytes) followed by a name that points to
  // itself: byte 12 = 0xC0 (pointer high), byte 13 = 0x0C (offset = 12).
  // Without cycle detection this would loop forever.
  const buf = Buffer.alloc(14);
  buf[12] = 0xC0;
  buf[13] = 0x0C;
  const reader = new Packet.Reader(buf);
  reader.offset = 8 * 12;
  assert.throws(() => Packet.Name.decode(reader), /pointer cycle/);
});

test('Name decode rejects a two-step pointer cycle', function() {
  // Two pointers pointing at each other: bytes 12-13 = C0 0E, bytes 14-15 = C0 0C.
  const buf = Buffer.alloc(16);
  buf[12] = 0xC0; buf[13] = 0x0E;
  buf[14] = 0xC0; buf[15] = 0x0C;
  const reader = new Packet.Reader(buf);
  reader.offset = 8 * 12;
  assert.throws(() => Packet.Name.decode(reader), /pointer cycle/);
});

test('Header default constructor initializes ancount/ad/cd', function() {
  const header = new Packet.Header();
  assert.equal(header.ancount, 0);
  assert.equal(header.ad, 0);
  assert.equal(header.cd, 0);
});

test('Header#parse exposes AD and CD bits (RFC 4035)', function() {
  // Second header word with AD=1, CD=1, all other flags zero.
  // Layout: qr(1) opcode(4) aa(1) tc(1) rd(1) ra(1) z(1) ad(1) cd(1) rcode(4)
  // bits  : 0  0000 0  0  0  0  0  1  1  0000  => 0000 0000 0011 0000 = 0x0030
  const buf = Buffer.from([
    0x00, 0x01, // id
    0x00, 0x30, // flags: AD=1, CD=1
    0x00, 0x00, 0x00, 0x00, // counts
    0x00, 0x00, 0x00, 0x00,
  ]);
  const header = Packet.Header.parse(buf);
  assert.equal(header.z, 0);
  assert.equal(header.ad, 1);
  assert.equal(header.cd, 1);
});

test('Header#toBuffer round-trips AD and CD bits', function() {
  const header = new Packet.Header({ id: 0x4242, ad: 1, cd: 1 });
  const parsed = Packet.Header.parse(header.toBuffer());
  assert.equal(parsed.id, 0x4242);
  assert.equal(parsed.ad, 1);
  assert.equal(parsed.cd, 1);
  assert.equal(parsed.z, 0);
});

test('EDNS exposes extendedRcode / version / doFlag', function() {
  const opt = new Packet.Resource.EDNS([], { extendedRcode: 16, version: 0, doFlag: true });
  assert.equal(opt.extendedRcode, 16);
  assert.equal(opt.version, 0);
  assert.equal(opt.doFlag, true);
  // ttl wire encoding: ext rcode in top byte, DO at bit 15 of low half.
  assert.equal(opt.ttl, (16 << 24) | 0x8000);
});

test('EDNS round-trip preserves DO bit and extended RCODE', function() {
  const opt = new Packet.Resource.EDNS([], { extendedRcode: 23, version: 0, doFlag: true });
  const parsed = Packet.Resource.decode(Packet.Resource.encode(opt));
  assert.equal(parsed.extendedRcode, 23);
  assert.equal(parsed.doFlag, true);
});

test('EDNS udpPayloadSize is configurable (RFC 6891 §6.2.3)', function() {
  const opt = new Packet.Resource.EDNS([], { udpPayloadSize: 4096 });
  assert.equal(opt.class, 4096);
  const parsed = Packet.Resource.decode(Packet.Resource.encode(opt));
  assert.equal(parsed.class, 4096);
});

test('EDNS.ECS#encode truncates IPv4 address to prefix length (RFC 7871)', function() {
  // /8 → 1 octet, /17 → 3 octets (ceil)
  for (const [ cidr, expectedOctets ] of [
    [ '10.0.0.0/8', 1 ],
    [ '10.20.0.0/16', 2 ],
    [ '10.20.30.0/24', 3 ],
    [ '10.20.30.0/17', 3 ],
    [ '10.20.30.40/32', 4 ],
  ]) {
    const query = new Packet.Resource.EDNS([ new Packet.Resource.EDNS.ECS(cidr) ]);
    const buf = Packet.Resource.encode(query);
    // Layout: name(1) type(2) class(2) ttl(4) rdlength(2) optionCode(2)
    // optionLength(2) → optionLength sits at offset 13. Address byte count =
    // optionLength - 4 (family + src prefix + scope prefix headers).
    const optionLength = buf.readUInt16BE(13);
    assert.equal(optionLength - 4, expectedOctets, `cidr ${cidr}`);
  }
});

test('EDNS.ECS#encode supports IPv6 family', function() {
  // family=2 (IPv6), /32 prefix → 4 leading octets of the address.
  const ecs = Packet.Resource.EDNS.ECS('2001:db8::/32');
  ecs.family = 2; // factory currently hard-codes family 1; opt into IPv6
  const opt = new Packet.Resource.EDNS([ ecs ]);
  const buf = Packet.Resource.encode(opt);
  const parsed = Packet.Resource.decode(buf);
  assert.equal(parsed.rdata[0].family, 2);
  assert.equal(parsed.rdata[0].sourcePrefixLength, 32);
  // The decoder pads truncated IPv6 to 8 segments; '2001:db8' followed by 6 zero segments.
  assert.equal(parsed.rdata[0].ip, '2001:db8:0:0:0:0:0:0');
});

test('Packet#encode compresses repeated names (RFC 1035 §4.1.4)', function() {
  // Same name in the question and answer should be encoded as a 2-byte
  // pointer (0xC0 0x0C → offset 12, immediately after the header). Without
  // compression the answer name alone would take 1 + 7 + 1 + 7 + 1 + 3 + 1
  // = 21 bytes; with compression it's 2.
  const pkt = new Packet();
  pkt.header.id = 1;
  pkt.header.qr = 1;
  pkt.questions.push({ name: 'example.com', type: Packet.TYPE.A, class: Packet.CLASS.IN });
  pkt.answers.push({
    name    : 'example.com',
    type    : Packet.TYPE.A,
    class   : Packet.CLASS.IN,
    ttl     : 60,
    address : '192.0.2.1',
  });
  const buf = pkt.toBuffer();
  // Question name 'example.com' starts at byte 12. The answer name should be
  // exactly 2 bytes: 0xC0 0x0C.
  const headerLen = 12;
  const questionNameLen = 1 + 7 + 1 + 3 + 1; // 'example' label + 'com' label + root
  const ansNameStart = headerLen + questionNameLen + 4; // + qtype + qclass
  assert.equal(buf[ansNameStart], 0xC0, 'answer name should start with pointer high byte');
  assert.equal(buf[ansNameStart + 1], 0x0C, 'pointer should target byte 12');
  // Round-trip back to verify the pointer resolves to the original name.
  const parsed = Packet.parse(buf);
  assert.equal(parsed.questions[0].name, 'example.com');
  assert.equal(parsed.answers[0].name, 'example.com');
});

test('Packet#encode compresses common suffixes (RFC 1035 §4.1.4)', function() {
  // a.example.com and b.example.com share the 'example.com' suffix; the
  // second name should be 'b' label + pointer to 'example.com'.
  const pkt = new Packet();
  pkt.header.id = 2;
  pkt.header.qr = 1;
  pkt.questions.push({ name: 'a.example.com', type: Packet.TYPE.A, class: Packet.CLASS.IN });
  pkt.answers.push({
    name    : 'b.example.com',
    type    : Packet.TYPE.A,
    class   : Packet.CLASS.IN,
    ttl     : 60,
    address : '192.0.2.2',
  });
  const buf = pkt.toBuffer();
  // Without compression the answer name uses 15 bytes; with shared-suffix
  // compression it uses 4: [1, 'b', pointer_hi, pointer_lo].
  const parsed = Packet.parse(buf);
  assert.equal(parsed.questions[0].name, 'a.example.com');
  assert.equal(parsed.answers[0].name, 'b.example.com');
  // Find the answer name in the wire format and verify its length.
  const headerLen = 12;
  const questionNameLen = 1 + 1 + 1 + 7 + 1 + 3 + 1; // 'a' . 'example' . 'com' . root
  const ansNameStart = headerLen + questionNameLen + 4;
  assert.equal(buf[ansNameStart], 1, "first byte is label length for 'b'");
  assert.equal(buf[ansNameStart + 1], 0x62, "second byte is 'b'");
  assert.equal(buf[ansNameStart + 2] & 0xC0, 0xC0, 'third byte starts a compression pointer');
});

test('Packet#encode compresses names inside rdata (CNAME)', function() {
  // The CNAME's target is example.com — same as the question name, so the
  // rdata should be just a 2-byte pointer.
  const pkt = new Packet();
  pkt.header.id = 3;
  pkt.header.qr = 1;
  pkt.questions.push({ name: 'alias.example.com', type: Packet.TYPE.CNAME, class: Packet.CLASS.IN });
  pkt.answers.push({
    name   : 'alias.example.com',
    type   : Packet.TYPE.CNAME,
    class  : Packet.CLASS.IN,
    ttl    : 60,
    domain : 'example.com',
  });
  const buf = pkt.toBuffer();
  const parsed = Packet.parse(buf);
  assert.equal(parsed.answers[0].domain, 'example.com');
  // The CNAME rdata should be exactly 2 bytes (compression pointer). Find it
  // by walking past header(12) + question(19+4) + ans_name(2) + type(2) +
  // class(2) + ttl(4) + rdlength(2).
  const rdlengthAt = 12 + (1 + 5 + 1 + 7 + 1 + 3 + 1) + 4 + 2 + 2 + 2 + 4;
  const rdlength = buf.readUInt16BE(rdlengthAt);
  assert.equal(rdlength, 2, 'CNAME pointing to existing name should compress to 2 bytes');
});

test('Packet#encode rejects oversized labels (RFC 1035 §2.3.4)', function() {
  const pkt = new Packet();
  pkt.questions.push({
    name  : 'x'.repeat(64) + '.example.com',
    type  : Packet.TYPE.A,
    class : Packet.CLASS.IN,
  });
  assert.throws(() => pkt.toBuffer(), /label/);
});

test('Packet#encode rejects oversized names (RFC 1035 §2.3.4)', function() {
  // 6 labels of 41 chars + 5 dots + root = 41*6 + 6 length bytes + 1 root = 253?
  // Build a name guaranteed to exceed 255 octets: 4 labels of 63 + dots.
  const labels = [ 'a'.repeat(63), 'b'.repeat(63), 'c'.repeat(63), 'd'.repeat(63) ];
  const pkt = new Packet();
  pkt.questions.push({
    name  : labels.join('.'),
    type  : Packet.TYPE.A,
    class : Packet.CLASS.IN,
  });
  assert.throws(() => pkt.toBuffer(), /name/);
});

test('Name#decode rejects an oversized label byte', function() {
  // Length byte 64 (0x40) has the second-highest bit set and is reserved.
  const buf = Buffer.from([ 0x40, 0x61, 0x00 ]);
  const reader = new Packet.Reader(buf);
  assert.throws(() => Packet.Name.decode(reader), /invalid label length/);
});

test('Resource#decode clamps TTL with the sign bit set (RFC 2181 §8)', function() {
  // Hand-build a minimal packet: header + 0 questions + 1 answer with TTL =
  // 0xFFFFFFFF and 4-byte A rdata.
  const pkt = Buffer.from([
    0x00, 0x01, 0x00, 0x00, // id, flags
    0x00, 0x00, 0x00, 0x01, // qdcount, ancount
    0x00, 0x00, 0x00, 0x00, // nscount, arcount
    // answer
    0x03, 0x66, 0x6f, 0x6f, 0x00, // name "foo"
    0x00, 0x01, // type A
    0x00, 0x01, // class IN
    0xFF, 0xFF, 0xFF, 0xFF, // TTL = 2^32 - 1 (high bit set)
    0x00, 0x04, // rdlength
    0xC0, 0x00, 0x02, 0x01, // 192.0.2.1
  ]);
  const parsed = Packet.parse(pkt);
  assert.equal(parsed.answers[0].ttl, 0x7FFFFFFF, 'high-bit TTL must be clamped to 2^31 - 1');
});

test('Packet#encode merges extended RCODE into OPT (RFC 6891 §6.1.3)', function() {
  // header.rcode = 16 (BADVERS) should propagate the high byte into the OPT
  // record's TTL and only the low nibble (0) into the header.
  const pkt = new Packet();
  pkt.header.id = 0xAAAA;
  pkt.header.qr = 1;
  pkt.header.rcode = 16;
  pkt.additionals.push(Packet.Resource.EDNS([]));
  const buf = pkt.toBuffer();
  // Header byte 3 holds Z|AD|CD|RCODE(low4). For rcode=16 → low nibble is 0.
  assert.equal(buf[3] & 0x0F, 0);
  // Parse it back: the merge should restore rcode=16.
  const parsed = Packet.parse(buf);
  assert.equal(parsed.header.rcode, 16);
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
