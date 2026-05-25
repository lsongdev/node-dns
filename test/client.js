const assert = require('node:assert');
const test = require('./test');
const {
  Packet,
  DOHClient,
  UDPClient,
  TCPClient,
  createUDPServer,
  createTCPServer,
  createDOHServer,
} = require('..');
const udp = require('node:dgram');

test('client/udp ignores stray response and resolves on matching id', async() => {
  // Simulate the scenario from upstream issue #100: a stray UDP packet (e.g.
  // late reply on a reused ephemeral port) arrives before the real response.
  // The client must drop it and keep listening rather than asserting/crashing.
  const server = udp.createSocket('udp4');
  await new Promise(resolve => server.bind(0, '127.0.0.1', resolve));
  const { port: serverPort } = server.address();

  server.on('message', (msg, rinfo) => {
    const request = Packet.parse(msg);

    // Stray packet: same socket, but a different (wrong) transaction id.
    const stray = new Packet();
    stray.header.id = (request.header.id + 1) & 0xffff;
    stray.header.qr = 1;
    server.send(stray.toBuffer(), rinfo.port, rinfo.address);

    // Real reply, slightly delayed so the stray definitely lands first.
    const response = Packet.createResponseFromRequest(request);
    response.answers.push({
      name    : request.questions[0].name,
      type    : Packet.TYPE.A,
      class   : Packet.CLASS.IN,
      ttl     : 300,
      address : '1.2.3.4',
    });
    setTimeout(() => server.send(response.toBuffer(), rinfo.port, rinfo.address), 5);
  });

  const query = UDPClient({ dns: '127.0.0.1', port: serverPort, timeout: 2000 });
  const reply = await query('stray.test');
  assert.equal(reply.answers.length, 1);
  assert.equal(reply.answers[0].address, '1.2.3.4');
  await new Promise(resolve => server.close(resolve));
});

test('client/udp times out when no matching response arrives', async() => {
  // Server replies with only stray packets; client must time out, not hang.
  const server = udp.createSocket('udp4');
  await new Promise(resolve => server.bind(0, '127.0.0.1', resolve));
  const { port: serverPort } = server.address();

  server.on('message', (msg, rinfo) => {
    const request = Packet.parse(msg);
    const stray = new Packet();
    stray.header.id = (request.header.id + 1) & 0xffff;
    stray.header.qr = 1;
    server.send(stray.toBuffer(), rinfo.port, rinfo.address);
  });

  const query = UDPClient({ dns: '127.0.0.1', port: serverPort, timeout: 100 });
  await assert.rejects(query('timeout.test'), err => err.code === 'ETIMEDOUT');
  await new Promise(resolve => server.close(resolve));
});

// createResponseFromRequest mutates the request in place (clears additionals);
// these tests snapshot relevant fields BEFORE building the response.

test('client/udp sends ECS additional when clientIp is set', async() => {
  const server = createUDPServer();
  let ednsRecord;
  let rd;
  server.on('request', (request, send) => {
    ednsRecord = request.additionals[0];
    rd = request.header.rd;
    send(Packet.createResponseFromRequest(request));
  });
  await server.listen(0, '127.0.0.1');
  const { port } = server.address();

  const query = UDPClient({ dns: '127.0.0.1', port });
  await query('ecs.test', 'A', Packet.CLASS.IN, { clientIp: '203.0.113.0/24' });

  assert.equal(rd, 1);
  assert.ok(ednsRecord);
  assert.equal(ednsRecord.type, Packet.TYPE.EDNS);
  assert.equal(ednsRecord.rdata.length, 1);
  assert.equal(ednsRecord.rdata[0].ip, '203.0.113.0');
  assert.equal(ednsRecord.rdata[0].sourcePrefixLength, 24);
  await new Promise(resolve => server.close(resolve));
});

test('client/udp honors recursive=false option', async() => {
  const server = createUDPServer();
  let rd;
  server.on('request', (request, send) => {
    rd = request.header.rd;
    send(Packet.createResponseFromRequest(request));
  });
  await server.listen(0, '127.0.0.1');
  const { port } = server.address();

  const query = UDPClient({ dns: '127.0.0.1', port });
  await query('non-recursive.test', 'A', Packet.CLASS.IN, { recursive: false });

  assert.equal(rd, 0);
  await new Promise(resolve => server.close(resolve));
});

test('client/udp passes type through to query', async() => {
  const server = createUDPServer();
  let questionType;
  server.on('request', (request, send) => {
    questionType = request.questions[0].type;
    send(Packet.createResponseFromRequest(request));
  });
  await server.listen(0, '127.0.0.1');
  const { port } = server.address();

  const query = UDPClient({ dns: '127.0.0.1', port });
  await query('mx.test', 'MX');
  assert.equal(questionType, Packet.TYPE.MX);
  await new Promise(resolve => server.close(resolve));
});

test('client/udp drops packets from unexpected source port', async() => {
  // A response coming from a port other than the configured one must be ignored.
  const realServer = udp.createSocket('udp4');
  const decoy = udp.createSocket('udp4');
  await new Promise(resolve => realServer.bind(0, '127.0.0.1', resolve));
  await new Promise(resolve => decoy.bind(0, '127.0.0.1', resolve));
  const { port: realPort } = realServer.address();

  const makeReply = (id, name, address) => {
    const p = new Packet();
    p.header.id = id;
    p.header.qr = 1;
    p.questions.push({ name, type: Packet.TYPE.A, class: Packet.CLASS.IN });
    p.answers.push({
      name, type: Packet.TYPE.A, class: Packet.CLASS.IN, ttl: 60, address,
    });
    return p.toBuffer();
  };

  realServer.on('message', (msg, rinfo) => {
    const request = Packet.parse(msg);
    const { id } = request.header;
    const name = request.questions[0].name;
    // Decoy reply (correct id, wrong sender) — must be dropped.
    decoy.send(makeReply(id, name, '9.9.9.9'), rinfo.port, rinfo.address);
    // Real reply, delayed so the decoy lands first.
    setTimeout(() => realServer.send(makeReply(id, name, '1.1.1.1'), rinfo.port, rinfo.address), 10);
  });

  const query = UDPClient({ dns: '127.0.0.1', port: realPort, timeout: 2000 });
  const reply = await query('spoof.test');
  assert.equal(reply.answers.length, 1);
  assert.equal(reply.answers[0].address, '1.1.1.1');
  await new Promise(resolve => realServer.close(resolve));
  await new Promise(resolve => decoy.close(resolve));
});

test('client/tcp end-to-end against local server', async() => {
  const server = createTCPServer();
  server.on('request', (request, send) => {
    const response = Packet.createResponseFromRequest(request);
    response.answers.push({
      name    : request.questions[0].name,
      type    : Packet.TYPE.A,
      class   : Packet.CLASS.IN,
      ttl     : 60,
      address : '10.20.30.40',
    });
    send(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  const query = TCPClient({ dns: '127.0.0.1', port });
  const reply = await query('tcp-client.test');
  assert.equal(reply.answers[0].address, '10.20.30.40');
  await new Promise(resolve => server.close(resolve));
});

test('client/tcp sends ECS additional when clientIp is set', async() => {
  const server = createTCPServer();
  let ednsRecord;
  server.on('request', (request, send) => {
    ednsRecord = request.additionals[0];
    send(Packet.createResponseFromRequest(request));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  const query = TCPClient({ dns: '127.0.0.1', port });
  await query('tcp-ecs.test', 'A', Packet.CLASS.IN, { clientIp: '198.51.100.0/24' });
  assert.ok(ednsRecord);
  assert.equal(ednsRecord.rdata[0].ip, '198.51.100.0');
  await new Promise(resolve => server.close(resolve));
});

test('client/tcp rejects unknown protocol', function() {
  assert.throws(() => TCPClient({ dns: '127.0.0.1', protocol: 'udp:' }),
    /Protocol must be tcp: or tls:/);
});

test('client/doh local http end-to-end', async() => {
  const server = createDOHServer();
  server.on('request', (request, send) => {
    const response = Packet.createResponseFromRequest(request);
    response.answers.push({
      name    : request.questions[0].name,
      type    : Packet.TYPE.A,
      class   : Packet.CLASS.IN,
      ttl     : 60,
      address : '172.16.0.1',
    });
    send(response);
  });
  const { port } = await new Promise(resolve => {
    server.on('listening', resolve);
    server.listen();
  });

  const query = DOHClient({ dns: `http://127.0.0.1:${port}/dns-query` });
  const reply = await query('doh-local.test', 'A');
  assert.equal(reply.answers[0].address, '172.16.0.1');
  server.close();
});

test('client/doh', async() => {
  const timeout = new Promise((resolve, reject) =>
    setTimeout(() => reject(new Error('DOH client timed out after 10s')), 10000).unref(),
  );
  const res = await Promise.race([
    DOHClient({ dns: 'https://1.0.0.1/dns-query' })('cdnjs.com', 'NS'),
    timeout,
  ]);

  // console.log(res);
  assert.equal(res.answers.length, 2);
  assert.equal(res.answers[0].name, 'cdnjs.com');
  assert.equal(res.answers[0].type, Packet.TYPE.NS);
  assert.equal(res.answers[0].class, Packet.CLASS.IN);
  assert.equal(res.answers[0].ns, 'ben.ns.cloudflare.com');
  assert.equal(res.answers[1].name, 'cdnjs.com');
  assert.equal(res.answers[1].type, Packet.TYPE.NS);
  assert.equal(res.answers[1].class, Packet.CLASS.IN);
  assert.equal(res.answers[1].ns, 'lara.ns.cloudflare.com');
  assert.equal(res.header.qr, 1);
  assert.equal(res.header.ancount, 2);
  assert.equal(res.header.rcode, 0);
});
