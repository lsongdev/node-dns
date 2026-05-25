const assert = require('node:assert');
const test = require('./test');
const {
  Packet,
  createDOHServer,
  createUDPServer,
  createTCPServer,
  createServer,
  TCPClient,
  UDPClient,
  DOHClient,
} = require('..');
const http = require('node:http');
const tcp = require('node:net');
const udp = require('node:dgram');

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

test('server/doh#cors - default', async function() {
  const server = createDOHServer();
  const { port } = await new Promise(resolve => {
    server.on('listening', resolve);
    server.listen();
  });
  const { headers } = await get(`http://localhost:${port}`);
  assert.equal(headers['access-control-allow-origin'], '*');
  server.close();
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
  server.close();
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
  server.close();
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
  server.close();
});

test('server/udp-tcp#simple-request-async-response', async() => {
  const server = createServer({
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

      (new Promise((resolve) => setTimeout(() => resolve(), 1))).then(() => send(response));
    },
  });
  const servers = await server.listen();
  assert.ok(servers.udp.port > 1000);
  assert.ok(servers.tcp.port > 1000);
  const tcpClient = TCPClient({ dns: '127.0.0.1', port: servers.tcp.port });
  const udpClient = UDPClient({ dns: '127.0.0.1', port: servers.udp.port });
  const expected = [ { name: 'test.com', ttl: 300, type: 16, class: 1, data: 'Hello World' } ];
  assert.deepEqual((await tcpClient('test.com')).answers, expected);
  assert.deepEqual((await udpClient('test.com')).answers, expected);
  await server.close();
});

test('server/udp#standalone end-to-end query', async() => {
  const server = createUDPServer();
  server.on('request', (request, send) => {
    const response = Packet.createResponseFromRequest(request);
    response.answers.push({
      name    : request.questions[0].name,
      type    : Packet.TYPE.A,
      class   : Packet.CLASS.IN,
      ttl     : 60,
      address : '198.51.100.10',
    });
    send(response);
  });
  await server.listen(0, '127.0.0.1');
  const { port } = server.address();

  const query = UDPClient({ dns: '127.0.0.1', port });
  const reply = await query('udp-only.test');
  assert.equal(reply.answers.length, 1);
  assert.equal(reply.answers[0].address, '198.51.100.10');
  assert.equal(reply.header.qr, 1);
  await new Promise(resolve => server.close(resolve));
});

test('server/tcp#standalone end-to-end query', async() => {
  const server = createTCPServer();
  server.on('request', (request, send) => {
    const response = Packet.createResponseFromRequest(request);
    response.answers.push({
      name    : request.questions[0].name,
      type    : Packet.TYPE.A,
      class   : Packet.CLASS.IN,
      ttl     : 60,
      address : '198.51.100.20',
    });
    send(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  const query = TCPClient({ dns: '127.0.0.1', port });
  const reply = await query('tcp-only.test');
  assert.equal(reply.answers.length, 1);
  assert.equal(reply.answers[0].address, '198.51.100.20');
  assert.equal(reply.header.qr, 1);
  await new Promise(resolve => server.close(resolve));
});

test('server/doh#GET via DOHClient end-to-end', async() => {
  const server = createDOHServer();
  server.on('request', (request, send) => {
    const response = Packet.createResponseFromRequest(request);
    response.answers.push({
      name    : request.questions[0].name,
      type    : Packet.TYPE.A,
      class   : Packet.CLASS.IN,
      ttl     : 60,
      address : '198.51.100.30',
    });
    send(response);
  });
  const { port } = await new Promise(resolve => {
    server.on('listening', resolve);
    server.listen();
  });

  const query = DOHClient({ dns: `http://127.0.0.1:${port}/dns-query` });
  const reply = await query('doh-get.test');
  assert.equal(reply.answers.length, 1);
  assert.equal(reply.answers[0].address, '198.51.100.30');
  server.close();
});

test('server/doh#POST end-to-end', async() => {
  const server = createDOHServer();
  server.on('request', (request, send) => {
    const response = Packet.createResponseFromRequest(request);
    response.answers.push({
      name  : request.questions[0].name,
      type  : Packet.TYPE.TXT,
      class : Packet.CLASS.IN,
      ttl   : 60,
      data  : 'post-ok',
    });
    send(response);
  });
  const { port } = await new Promise(resolve => {
    server.on('listening', resolve);
    server.listen();
  });

  const packet = new Packet();
  packet.header.rd = 1;
  packet.questions.push({ name: 'doh-post.test', type: Packet.TYPE.TXT, class: Packet.CLASS.IN });

  const body = await new Promise((resolve, reject) => {
    const req = http.request({
      host    : '127.0.0.1',
      port,
      path    : '/dns-query',
      method  : 'POST',
      headers : {
        accept         : 'application/dns-message',
        'content-type' : 'application/dns-message',
      },
    }, res => {
      assert.equal(res.statusCode, 200);
      assert.equal(res.headers['content-type'], 'application/dns-message');
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end(packet.toBuffer());
  });
  const parsed = Packet.parse(body);
  assert.equal(parsed.answers.length, 1);
  assert.equal(parsed.answers[0].data, 'post-ok');
  server.close();
});

test('server/doh#405 on unsupported method', async() => {
  const server = createDOHServer();
  const { port } = await new Promise(resolve => {
    server.on('listening', resolve);
    server.listen();
  });
  const { statusCode } = await new Promise((resolve, reject) => {
    const req = http.request({
      host    : '127.0.0.1',
      port,
      path    : '/dns-query',
      method  : 'PUT',
      headers : { accept: 'application/dns-message' },
    }, resolve);
    req.on('error', reject);
    req.end();
  });
  assert.equal(statusCode, 405);
  server.close();
});

test('server/doh#404 on unknown path', async() => {
  const server = createDOHServer();
  const { port } = await new Promise(resolve => {
    server.on('listening', resolve);
    server.listen();
  });
  const statusCode = await new Promise((resolve, reject) => {
    http.get({
      host    : '127.0.0.1',
      port,
      path    : '/something-else',
      headers : { accept: 'application/dns-message' },
    }, res => resolve(res.statusCode)).on('error', reject);
  });
  assert.equal(statusCode, 404);
  server.close();
});

test('server/doh#400 on missing accept header', async() => {
  const server = createDOHServer();
  const { port } = await new Promise(resolve => {
    server.on('listening', resolve);
    server.listen();
  });
  const statusCode = await new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: '/dns-query?dns=abc' }, res => resolve(res.statusCode))
      .on('error', reject);
  });
  assert.equal(statusCode, 400);
  server.close();
});

test('server/doh#400 on missing dns query param', async() => {
  const server = createDOHServer();
  const { port } = await new Promise(resolve => {
    server.on('listening', resolve);
    server.listen();
  });
  const statusCode = await new Promise((resolve, reject) => {
    http.get({
      host    : '127.0.0.1',
      port,
      path    : '/dns-query',
      headers : { accept: 'application/dns-message' },
    }, res => resolve(res.statusCode)).on('error', reject);
  });
  assert.equal(statusCode, 400);
  server.close();
});

test('server/all#multi-question request is preserved through handle', async() => {
  const server = createServer({
    udp    : true,
    handle : (request, send) => {
      const response = Packet.createResponseFromRequest(request);
      for (const q of request.questions) {
        response.answers.push({
          name    : q.name,
          type    : Packet.TYPE.A,
          class   : Packet.CLASS.IN,
          ttl     : 60,
          address : '127.0.0.1',
        });
      }
      send(response);
    },
  });
  const { udp: udpAddr } = await server.listen();

  // Hand-build a 2-question request and send via raw UDP.
  const request = new Packet();
  request.header.id = 0x4242;
  request.header.rd = 1;
  request.questions.push({ name: 'first.multi', type: Packet.TYPE.A, class: Packet.CLASS.IN });
  request.questions.push({ name: 'second.multi', type: Packet.TYPE.A, class: Packet.CLASS.IN });
  const client = udp.createSocket('udp4');
  const reply = await new Promise((resolve, reject) => {
    client.on('message', msg => resolve(Packet.parse(msg)));
    client.on('error', reject);
    client.send(request.toBuffer(), udpAddr.port, '127.0.0.1');
  });
  await new Promise(resolve => client.close(resolve));
  assert.equal(reply.header.id, 0x4242);
  assert.equal(reply.questions.length, 2);
  assert.equal(reply.answers.length, 2);
  await server.close();
});

test('server/all#close event fires once all sub-servers close', async() => {
  const server = createServer({ doh: true, tcp: true, udp: true, handle: () => {} });
  await server.listen();
  const closed = new Promise(resolve => server.on('close', resolve));
  await server.close();
  await closed;
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

test('server/all#handler can respond with RCODE error codes', async() => {
  const server = createServer({
    udp : true,
    tcp : true,
    handle(request, send) {
      const response = Packet.createResponseFromRequest(request);
      const [ question ] = request.questions;
      if (question.name === 'refused.test') {
        response.header.rcode = Packet.RCODE.REFUSED;
      } else if (question.name === 'nxdomain.test') {
        response.header.rcode = Packet.RCODE.NXDOMAIN;
      } else if (question.name === 'servfail.test') {
        response.header.rcode = Packet.RCODE.SERVFAIL;
      }
      send(response);
    },
  });
  const servers = await server.listen();

  const udpClient = UDPClient({ dns: '127.0.0.1', port: servers.udp.port });
  const tcpClient = TCPClient({ dns: '127.0.0.1', port: servers.tcp.port });

  const udpRefused = await udpClient('refused.test');
  const tcpRefused = await tcpClient('refused.test');
  const udpNxdomain = await udpClient('nxdomain.test');
  const tcpNxdomain = await tcpClient('nxdomain.test');
  const udpServfail = await udpClient('servfail.test');
  const tcpServfail = await tcpClient('servfail.test');

  assert.equal(udpRefused.header.rcode, Packet.RCODE.REFUSED, 'UDP REFUSED');
  assert.equal(tcpRefused.header.rcode, Packet.RCODE.REFUSED, 'TCP REFUSED');
  assert.equal(udpNxdomain.header.rcode, Packet.RCODE.NXDOMAIN, 'UDP NXDOMAIN');
  assert.equal(tcpNxdomain.header.rcode, Packet.RCODE.NXDOMAIN, 'TCP NXDOMAIN');
  assert.equal(udpServfail.header.rcode, Packet.RCODE.SERVFAIL, 'UDP SERVFAIL');
  assert.equal(tcpServfail.header.rcode, Packet.RCODE.SERVFAIL, 'TCP SERVFAIL');

  // All error responses must still be marked as responses (qr=1) and carry
  // the question back, with no answers.
  assert.equal(udpRefused.header.qr, 1);
  assert.equal(udpRefused.questions[0].name, 'refused.test');
  assert.equal(udpRefused.answers.length, 0);

  await server.close();
});

test('server/all#maxConcurrent - requests within limit are served normally', async() => {
  const server = createServer({
    udp           : true,
    maxConcurrent : 10,
    handle(request, send) {
      const response = Packet.createResponseFromRequest(request);
      response.answers.push({
        name    : request.questions[0].name,
        type    : Packet.TYPE.A,
        class   : Packet.CLASS.IN,
        ttl     : 60,
        address : '1.2.3.4',
      });
      send(response);
    },
  });
  const { udp: { port } } = await server.listen();
  const client = UDPClient({ dns: '127.0.0.1', port });

  const reply = await client('within-limit.test');
  assert.equal(reply.header.rcode, Packet.RCODE.NOERROR);
  assert.equal(reply.answers[0].address, '1.2.3.4');

  await server.close();
});

test('server/all#maxConcurrent - excess requests receive SERVFAIL', async() => {
  // Use a handler that holds requests open until we release them, so we can
  // saturate the concurrency limit predictably.
  const pending = [];
  const server = createServer({
    udp           : true,
    maxConcurrent : 2,
    handle(request, send) {
      pending.push({ request, send });
    },
  });
  const { udp: { port } } = await server.listen();
  const client = UDPClient({ dns: '127.0.0.1', port });

  // Fire q1 and q2 but don't await — they stay in the handler holding 2 slots.
  const p1 = client('q1.test');
  const p2 = client('q2.test');

  // Wait until both are registered with the handler.
  while (pending.length < 2) await new Promise(r => setTimeout(r, 5));

  // q3 arrives when the limit is already full — should be shed immediately.
  const r3 = await client('q3.test');
  assert.equal(r3.header.rcode, Packet.RCODE.SERVFAIL, 'shed request gets SERVFAIL');

  // Drain the two held requests so the server can close cleanly.
  for (const { request, send } of pending) {
    const response = Packet.createResponseFromRequest(request);
    response.header.rcode = Packet.RCODE.NOERROR;
    send(response);
  }
  await Promise.all([ p1, p2 ]);

  await server.close();
});

// ---------------------------------------------------------------------------
// PROXY protocol (issue #81) — UDP and TCP servers expose the real client IP
// when sitting behind an L4 proxy (Nginx stream, HAProxy, etc).
// ---------------------------------------------------------------------------

const proxyProtocol = require('../lib/proxy-protocol');

test('server/udp#proxyProtocol exposes real client address (v2 IPv4)', async() => {
  const server = createUDPServer({ proxyProtocol: true });
  let observedClient;
  server.on('request', (request, send, info) => {
    observedClient = info;
    const response = Packet.createResponseFromRequest(request);
    response.answers.push({
      name    : request.questions[0].name,
      type    : Packet.TYPE.A,
      class   : Packet.CLASS.IN,
      ttl     : 60,
      address : '127.0.0.1',
    });
    send(response);
  });
  await server.listen(0, '127.0.0.1');
  const { port: serverPort } = server.address();

  // Build a DNS query and prepend a PROXY v2 IPv4 header naming a fake client.
  const query = new Packet();
  query.header.id = 0x4321;
  query.header.rd = 1;
  query.questions.push({ name: 'proxied.test', type: Packet.TYPE.A, class: Packet.CLASS.IN });
  const header = proxyProtocol.buildV2Ipv4({
    sourceAddress      : '203.0.113.77',
    destinationAddress : '127.0.0.1',
    sourcePort         : 50001,
    destinationPort    : serverPort,
    transport          : 'DGRAM',
  });
  const datagram = Buffer.concat([ header, query.toBuffer() ]);

  const sender = udp.createSocket('udp4');
  const reply = await new Promise((resolve, reject) => {
    sender.on('message', msg => resolve(Packet.parse(msg)));
    sender.on('error', reject);
    sender.send(datagram, serverPort, '127.0.0.1');
  });
  await new Promise(resolve => sender.close(resolve));

  assert.equal(reply.header.id, 0x4321);
  assert.equal(reply.answers[0].address, '127.0.0.1');
  assert.equal(observedClient.address, '203.0.113.77');
  assert.equal(observedClient.port, 50001);
  assert.equal(observedClient.proxy.version, 2);
  assert.equal(observedClient.proxy.transport, 'DGRAM');
  await new Promise(resolve => server.close(resolve));
});

test('server/udp#proxyProtocol with missing header emits requestError', async() => {
  const server = createUDPServer({ proxyProtocol: true });
  let captured;
  server.on('requestError', e => { captured = e; });
  await server.listen(0, '127.0.0.1');
  const { port: serverPort } = server.address();

  const query = new Packet();
  query.header.id = 1;
  query.questions.push({ name: 'noheader.test', type: Packet.TYPE.A, class: Packet.CLASS.IN });

  const sender = udp.createSocket('udp4');
  await new Promise(resolve => sender.send(query.toBuffer(), serverPort, '127.0.0.1', resolve));
  // Give the server a moment to handle the datagram.
  await new Promise(resolve => setTimeout(resolve, 20));
  await new Promise(resolve => sender.close(resolve));

  assert.ok(captured, 'expected requestError to fire');
  assert.match(captured.message, /PROXY/);
  await new Promise(resolve => server.close(resolve));
});

test('server/tcp#proxyProtocol v1 exposes real client address', async() => {
  const server = createTCPServer({ proxyProtocol: true });
  let observed;
  server.on('request', (request, send, client) => {
    observed = { address: client.proxyAddress, port: client.proxyPort, proxy: client.proxy };
    const response = Packet.createResponseFromRequest(request);
    response.answers.push({
      name    : request.questions[0].name,
      type    : Packet.TYPE.A,
      class   : Packet.CLASS.IN,
      ttl     : 60,
      address : '127.0.0.1',
    });
    send(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port: serverPort } = server.address();

  const query = new Packet();
  query.header.id = 0x1111;
  query.questions.push({ name: 'proxied-tcp.test', type: Packet.TYPE.A, class: Packet.CLASS.IN });
  const dnsMessage = query.toBuffer();
  const length = Buffer.alloc(2);
  length.writeUInt16BE(dnsMessage.length);
  const proxyHeader = proxyProtocol.buildV1({
    family             : 'TCP4',
    sourceAddress      : '198.51.100.42',
    destinationAddress : '127.0.0.1',
    sourcePort         : 51515,
    destinationPort    : serverPort,
  });

  const reply = await new Promise((resolve, reject) => {
    const sock = tcp.connect(serverPort, '127.0.0.1', () => {
      sock.write(Buffer.concat([ proxyHeader, length, dnsMessage ]));
    });
    const chunks = [];
    sock.on('data', c => chunks.push(c));
    sock.on('end', () => {
      const buf = Buffer.concat(chunks);
      resolve(Packet.parse(buf.slice(2)));
    });
    sock.on('error', reject);
  });

  assert.equal(reply.header.id, 0x1111);
  assert.equal(reply.answers[0].address, '127.0.0.1');
  assert.equal(observed.address, '198.51.100.42');
  assert.equal(observed.port, 51515);
  assert.equal(observed.proxy.version, 1);
  await new Promise(resolve => server.close(resolve));
});

test('server/tcp#proxyProtocol v2 exposes real client address', async() => {
  const server = createTCPServer({ proxyProtocol: true });
  let observed;
  server.on('request', (request, send, client) => {
    observed = { address: client.proxyAddress, port: client.proxyPort, version: client.proxy.version };
    const response = Packet.createResponseFromRequest(request);
    response.answers.push({
      name    : request.questions[0].name,
      type    : Packet.TYPE.A,
      class   : Packet.CLASS.IN,
      ttl     : 60,
      address : '127.0.0.1',
    });
    send(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port: serverPort } = server.address();

  const query = new Packet();
  query.header.id = 0x2222;
  query.questions.push({ name: 'proxied-tcp-v2.test', type: Packet.TYPE.A, class: Packet.CLASS.IN });
  const dnsMessage = query.toBuffer();
  const length = Buffer.alloc(2);
  length.writeUInt16BE(dnsMessage.length);
  const proxyHeader = proxyProtocol.buildV2Ipv4({
    sourceAddress      : '198.51.100.99',
    destinationAddress : '127.0.0.1',
    sourcePort         : 52525,
    destinationPort    : serverPort,
  });

  const reply = await new Promise((resolve, reject) => {
    const sock = tcp.connect(serverPort, '127.0.0.1', () => {
      sock.write(Buffer.concat([ proxyHeader, length, dnsMessage ]));
    });
    const chunks = [];
    sock.on('data', c => chunks.push(c));
    sock.on('end', () => resolve(Packet.parse(Buffer.concat(chunks).slice(2))));
    sock.on('error', reject);
  });

  assert.equal(reply.header.id, 0x2222);
  assert.equal(observed.address, '198.51.100.99');
  assert.equal(observed.port, 52525);
  assert.equal(observed.version, 2);
  await new Promise(resolve => server.close(resolve));
});

test('server/tcp#proxyProtocol with garbage prefix emits requestError', async() => {
  const server = createTCPServer({ proxyProtocol: true });
  let captured;
  server.on('requestError', e => { captured = e; });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port: serverPort } = server.address();

  await new Promise((resolve, reject) => {
    const sock = tcp.connect(serverPort, '127.0.0.1', () => {
      sock.end(Buffer.from('GET / HTTP/1.1\r\n\r\n', 'ascii'));
    });
    sock.on('close', resolve);
    sock.on('error', reject);
  });
  // Give the server an event-loop tick to surface the error.
  await new Promise(resolve => setTimeout(resolve, 20));

  assert.ok(captured, 'expected requestError to fire');
  assert.match(captured.message, /PROXY/);
  await new Promise(resolve => server.close(resolve));
});

test('server/udp/tcp without proxyProtocol still work normally', async() => {
  // Regression guard: enabling the option is opt-in; default behavior unchanged.
  const udpServer = createUDPServer();
  udpServer.on('request', (request, send) => {
    const response = Packet.createResponseFromRequest(request);
    response.answers.push({
      name    : request.questions[0].name,
      type    : Packet.TYPE.A,
      class   : Packet.CLASS.IN,
      ttl     : 60,
      address : '10.0.0.1',
    });
    send(response);
  });
  await udpServer.listen(0, '127.0.0.1');
  const udpQuery = UDPClient({ dns: '127.0.0.1', port: udpServer.address().port });
  const udpReply = await udpQuery('plain.test');
  assert.equal(udpReply.answers[0].address, '10.0.0.1');
  await new Promise(resolve => udpServer.close(resolve));

  const tcpServer = createTCPServer();
  tcpServer.on('request', (request, send) => {
    const response = Packet.createResponseFromRequest(request);
    response.answers.push({
      name    : request.questions[0].name,
      type    : Packet.TYPE.A,
      class   : Packet.CLASS.IN,
      ttl     : 60,
      address : '10.0.0.2',
    });
    send(response);
  });
  await new Promise(resolve => tcpServer.listen(0, '127.0.0.1', resolve));
  const tcpQuery = TCPClient({ dns: '127.0.0.1', port: tcpServer.address().port });
  const tcpReply = await tcpQuery('plain.test');
  assert.equal(tcpReply.answers[0].address, '10.0.0.2');
  await new Promise(resolve => tcpServer.close(resolve));
});
