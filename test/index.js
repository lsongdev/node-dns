const assert = require('assert');
const test = require('./test');
const Packet = require('../packet');

var request = Buffer.from([
  0x29, 0x64, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x06, 0x67, 0x6f, 0x6f,
  0x67, 0x6c, 0x65, 0x03, 0x63, 0x6f, 0x6d, 0x00,
  0x00, 0x01, 0x00, 01]);

var response = Buffer.from([
  0x29, 0x64, 0x81, 0x80, 0x00, 0x01, 0x00, 0x01,
  0x00, 0x00, 0x00, 0x00, 0x03, 0x77, 0x77, 0x77,
  0x01, 0x7a, 0x02, 0x63, 0x6e, 0x00, 0x00, 0x01,
  0x00, 0x01, 0xc0, 0x0c, 0x00, 0x01, 0x00, 0x01,
  0x00, 0x00, 0x01, 0x90, 0x00, 0x04, 0x36, 0xde,
  0x3c, 0xfc]);

test('Name#encode', function () {
  var name = Packet.Name.encode('www.google.com');
  var pattern = [3, 'w', 'w', 'w', 5, 'g', 'o', 'o', 'g', 'l', 'e', 3, 'c', 'o', 'm', '0'];
  assert.equal(name.length, pattern.length);
});

test('Name#decode', function () {
  var reader = new Packet.Reader(response, 8 * 12);
  var name = Packet.Name.decode(reader);
  assert.equal(name, 'www.z.cn');

  reader.offset = 8 * 26;
  var name = Packet.Name.decode(reader);
  assert.equal(reader.offset, 8 * 28);
  assert.equal(name, 'www.z.cn');

});

test('Header#encode', function () {
  var header = new Packet.Header({ id: 0x2964, qr: 1 });
  header.qdcount = 1;
  header.ancount = 2;
  assert.deepEqual(header.toBuffer(), Buffer.from([
    0x29, 0x64, 0x80, 0x00, 0x00, 0x01, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00]));
});

test('Header#parse', function () {
  var header = Packet.Header.parse(response);
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

test('Question#encode', function () {

  var question = new Packet.Question({
    name: 'google.com',
    type: Packet.TYPE.A,
    class: Packet.CLASS.IN
  });
  //
  assert.deepEqual(question.toBuffer(), Buffer.from([
    0x06, 0x67, 0x6f, 0x6f, 0x67, 0x6c, 0x65, 0x03,
    0x63, 0x6f, 0x6d, 0x00, 0x00, 0x01, 0x00, 0x01
  ]));
});

test('Question#decode', function () {

  var question = new Packet.Question('google.com',
    Packet.TYPE.A, Packet.CLASS.IN);
  assert.deepEqual(question.toBuffer(), Buffer.from([
    0x06, 0x67, 0x6f, 0x6f, 0x67, 0x6c, 0x65, 0x03,
    0x63, 0x6f, 0x6d, 0x00, 0x00, 0x01, 0x00, 0x01
  ]));
});

//
test('Packet#parse', function () {
  var packet = Packet.parse(response);
  assert.equal(packet.questions[0].name, 'www.z.cn');
  assert.equal(packet.questions[0].type, Packet.TYPE.A);
  assert.equal(packet.questions[0].class, Packet.CLASS.IN);
  assert.equal(packet.answers[0].class, Packet.TYPE.A);
  assert.equal(packet.answers[0].class, Packet.CLASS.IN);
  assert.equal(packet.answers[0].address, '54.222.60.252');
});

test('Packet#encode', function () {


  var response = new Packet();
  //
  response.header.qr = 1;
  response.answers.push({
    name: 'lsong.org',
    type: Packet.TYPE.A,
    class: Packet.CLASS.IN,
    ttl: 300,
    address: '127.0.0.1'
  });

  response.answers.push({
    name: 'lsong.org',
    type: Packet.TYPE.AAAA,
    class: Packet.CLASS.IN,
    ttl: 300,
    address: '2001:db8::::ff00:42:8329'
  });

  response.answers.push({
    name: 'lsong.org',
    type: Packet.TYPE.CNAME,
    class: Packet.CLASS.IN,
    ttl: 300,
    domain: 'sfo1.lsong.org'
  });

  response.authorities.push({
    name: 'lsong.org',
    type: Packet.TYPE.MX,
    class: Packet.CLASS.IN,
    ttl: 300,
    exchange: 'mail.lsong.org',
    priority: 5
  });

  response.authorities.push({
    name: 'lsong.org',
    type: Packet.TYPE.NS,
    class: Packet.CLASS.IN,
    ttl: 300,
    ns: 'ns1.lsong.org',
  });

  response.additionals.push({
    name: 'lsong.org',
    type: Packet.TYPE.SOA,
    class: Packet.CLASS.IN,
    ttl: 300,
    primary: 'lsong.org',
    admin: 'admin@lsong.org',
    serial: 2016121301,
    refresh: 300,
    retry: 3,
    expiration: 10,
    minimum: 10
  });
  //
  response.additionals.push({
    name: 'lsong.org',
    type: Packet.TYPE.TXT,
    class: Packet.CLASS.IN,
    ttl: 300,
    data: '#v=spf1 include:_spf.google.com ~all'
  });

  assert.deepEqual(Packet.parse(response.toBuffer()), response);

});

test('Packet#encode array of character strings', function () {
  var response = new Packet();
  //
  var dkim = ['v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAsD6Th73ZDKkFAntNZDbx',
    'Eh8VV2DSMs3re6v9/gXoT3dGcbSsuUMpfLzP5MWp4sW5cPyZxEGSiC03ZVIcCca0GRAuX9b1M0Qy25wLmPq',
    '8eT129mhwbeX50xTaXqq63A/oDM0QOPe1IeBMfPnR9tWXxvEzZKvVbmTlMY5bf+3QHLqmaEihnGlXh2LRVZ',
    'be2EMlYo18YM4LU/LkZKe06rxlq38W22TL7964tr7jmOZ+huXf2iLSg4nc4UzLwb2aOdOA+w4c87h+HW/L8',
    '0548pFguF46TKc0C0egZ+oll3Y8zySYrbkVrWFrcpnrw5qDiRVHEjxqZSubSYX+16TjNcJg9QIDAQAB'];

  response.header.qr = 1;
  response.answers.push({
    name: 'lsong.org',
    type: Packet.TYPE.TXT,
    class: Packet.CLASS.IN,
    ttl: 300,
    data: dkim
  });

  assert.equal(Packet.parse(response.toBuffer()).answers[0].data, dkim.join(''))
});

test('EDNS.ECS#encode', function () {
  var query = new Packet.Resource.EDNS([
    new Packet.Resource.EDNS.ECS('10.11.12.13/24')
  ]);

  let b = Packet.Resource.encode(query)
  assert.deepEqual(b, Buffer.from([
    0x00, 0x00, 0x29, 0x02, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x0c, 0x00, 0x08, 0x00, 0x08, 0x00,
    0x01, 0x18, 0x00, 0x0a, 0x0b, 0x0c, 0x0d]))
})

test('EDNS#decode', function () {
  const buffer = Buffer.from([0x00, 0x08, 0x00, 0x08, 0x00, 0x01, 0x18, 0x00, 0x0a, 0x0b, 0x0c, 0x0d]);
  const reader = new Packet.Reader(buffer);
  const record = Packet.Resource.EDNS.decode(reader, buffer.length);

  assert.equal(record.rdata.length, 1);
  assert.equal(record.rdata[0].ednsCode, 8);
  assert.equal(record.rdata[0].family, 1);
  assert.equal(record.rdata[0].sourcePrefixLength, 24);
  assert.equal(record.rdata[0].scopePrefixLength, 0);
  assert.equal(record.rdata[0].ip, '10.11.12.13');

  const query = new Packet.Resource.EDNS([
    new Packet.Resource.EDNS.ECS('10.20.0.0/16')
  ]);
  const encoded = Packet.Resource.encode(query);
  const decoded = Packet.Resource.decode(encoded);
  delete decoded.name;

  assert.deepEqual(decoded, query);
});

test('EDNS#decode multiple', function () {
  const query = new Packet.Resource.EDNS([
    new Packet.Resource.EDNS.ECS('10.0.0.0/8'),
    new Packet.Resource.EDNS.ECS('10.9.0.0/16'),
    new Packet.Resource.EDNS.ECS('10.9.8.0/24'),
    new Packet.Resource.EDNS.ECS('10.9.8.7/32')
  ]);
  const encoded = Packet.Resource.encode(query);
  const decoded = Packet.Resource.decode(encoded);
  delete decoded.name;

  assert.deepEqual(decoded, query);
});
