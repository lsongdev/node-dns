const assert = require('assert');
const test = require('./test');
const { Packet, createDOHServer, createServer, TCPClient, DOHClient, UDPClient } = require('..');
const http = require('http');
const tcp = require('net');
const udp = require('dgram');

/* TODO: below is unused, either delete or use
const request = Buffer.from([
  0x29, 0x64, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x06, 0x67, 0x6f, 0x6f,
  0x67, 0x6c, 0x65, 0x03, 0x63, 0x6f, 0x6d, 0x00,
  0x00, 0x01, 0x00, 0x01]);
*/

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

test('server/doh#cors - default', async function() {
  const server = createDOHServer();
  const { port } = await new Promise(resolve => {
    server.on('listening', resolve);
    server.listen();
  });
  const { headers } = await get(`http://localhost:${port}`);
  assert.equal(headers['access-control-allow-origin'], '*');
  server.server.close();
});

test('server/doh#cors - no cors', async function() {
  const server = createDOHServer({
    cors: false,
  });
  const { port } = await new Promise(resolve => {
    server.on('listening', resolve);
    server.listen();
  });
  const { headers } = await get(`http://localhost:${port}`);
  assert.equal(headers['access-control-allow-origin'], undefined);
  server.server.close();
});

test('server/doh#cors - cors origin', async function() {
  const server = createDOHServer({
    cors: 'some.domain',
  });
  const { port } = await new Promise(resolve => {
    server.on('listening', resolve);
    server.listen();
  });
  const { headers } = await get(`http://localhost:${port}`);
  assert.equal(headers['access-control-allow-origin'], 'some.domain');
  assert.equal(headers.vary, 'Origin');
  server.server.close();
});

test('server/doh#cors - cors function', async function() {
  const server = createDOHServer({
    cors(domain) {
      if (domain === 'a.domain') {
        return true;
      } else if (domain === 'b.domain') {
        return false;
      }
      throw new Error(`Unexpected domain: ${domain}`);
    },
  });
  const { port } = await new Promise(resolve => {
    server.on('listening', resolve);
    server.listen();
  });
  let headers = (await get(`http://localhost:${port}`, { headers: { origin: 'a.domain' } })).headers;
  assert.equal(headers['access-control-allow-origin'], 'a.domain');
  assert.equal(headers.vary, 'Origin');
  headers = (await get(`http://localhost:${port}`, { headers: { origin: 'b.domain' } })).headers;
  assert.equal(headers['access-control-allow-origin'], 'false');
  assert.equal(headers.vary, 'Origin');
  server.server.close();
});

test('server/all#simple-request', async() => {
  const server = createServer({
    doh : true,
    tcp : true,
    udp : true,
    handle(request, send, _info) {
      const [ question ] = request.questions;
      assert.deepEqual(request.questions, [ { name: 'test.com', type: 1, class: 1 } ]);
      const response = Packet.createResponseFromRequest(request);
      response.answers.push({
        name  : question.name,
        type  : Packet.TYPE.TXT,
        class : Packet.CLASS.IN,
        ttl   : 300,
        data  : [ 'Hello World' ],
      });
      send(response);
    },
  });
  const servers = await server.listen();
  assert.ok(servers.udp.port > 1000);
  assert.ok(servers.tcp.port > 1000);
  assert.ok(servers.doh.port > 1000);
  const doh = DOHClient({ dns: `127.0.0.1:${servers.doh.port}`, http: true });
  const tcp = TCPClient({ dns: '127.0.0.1', port: servers.tcp.port });
  const udp = UDPClient({ dns: '127.0.0.1', port: servers.udp.port });
  const expected = [ { name: 'test.com', ttl: 300, type: 16, class: 1, data: 'Hello World' } ];
  assert.deepEqual((await doh('test.com')).answers, expected);
  assert.deepEqual((await tcp('test.com')).answers, expected);
  assert.deepEqual((await udp('test.com')).answers, expected);
  await server.close();
});

test('server/all#invalid-request', async() => {
  const server = createServer({
    doh    : true,
    tcp    : true,
    udp    : true,
    handle : () => {},
  });
  const servers = await server.listen();
  assert.ok(servers.udp.port > 1000);
  assert.ok(servers.tcp.port > 1000);
  assert.ok(servers.doh.port > 1000);

  const errors = [];
  server.on('requestError', (e) => {
    errors.push(e);
  });

  const tcpSocket = tcp.connect({ port: servers.tcp.port, host: '127.0.0.1' });
  tcpSocket.on('connect', () => tcpSocket.end('INVALID'));

  const udpSocket = udp.createSocket('udp4');
  udpSocket.send('INVALID', servers.udp.port, '127.0.0.1', () => udpSocket.close());

  const dohConn = http.get(`http://127.0.0.1:${servers.doh.port}/dns-query?dns=INVALID`, {
    headers: { accept: 'application/dns-message' },
  }).on('error', () => {});

  await Promise.all([
    new Promise((resolve) => tcpSocket.on('close', resolve)),
    new Promise((resolve) => udpSocket.on('close', resolve)),
    new Promise((resolve) => dohConn.on('close', resolve)),
  ]);

  assert.equal(errors.length, 3);

  await server.close();
});

function get(url, options) {
  return new Promise((resolve, reject) => {
    try {
      const req = http.get(url, options, res => {
        const result = [];
        res.on('data', data => result.push(data));
        res.once('error', reject);
        res.once('end', () => resolve({
          body    : Buffer.concat(result),
          headers : res.headers,
        }));
      });
      req.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}
