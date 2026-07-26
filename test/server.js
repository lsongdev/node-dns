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
        res.once('end', () =>
          resolve({
            body: Buffer.concat(result),
            headers: res.headers,
          }),
        );
      });
      req.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}

// Open a TCP connection, write a single request payload, read one
// length-prefixed reply, then close. Replaces the older pattern of waiting
// for the server to half-close — RFC 7766 servers hold connections open for
// pipelining, so the client must signal it's done.
function readOneTcpReply(port, payload) {
  return new Promise((resolve, reject) => {
    const sock = tcp.connect(port, '127.0.0.1', () => sock.write(payload));
    let buffered = Buffer.alloc(0);
    sock.on('data', chunk => {
      buffered = Buffer.concat([buffered, chunk]);
      if (buffered.length < 2) return;
      const len = buffered.readUInt16BE(0);
      if (buffered.length < 2 + len) return;
      const message = buffered.slice(2, 2 + len);
      sock.end();
      resolve(Packet.parse(message));
    });
    sock.on('error', reject);
  });
}

test('server/doh#cors - default', async function () {
  const server = createDOHServer();
  const { port } = await new Promise(resolve => {
    server.on('listening', resolve);
    server.listen();
  });
  const { headers } = await get(`http://localhost:${port}`);
  assert.equal(headers['access-control-allow-origin'], '*');
  server.close();
});

test('server/doh#cors - no cors', async function () {
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

test('server/doh#cors - cors origin', async function () {
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

test('server/doh#cors - cors function', async function () {
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
  let headers = (
    await get(`http://localhost:${port}`, { headers: { origin: 'a.domain' } })
  ).headers;
  assert.equal(headers['access-control-allow-origin'], 'a.domain');
  assert.equal(headers.vary, 'Origin');
  headers = (
    await get(`http://localhost:${port}`, { headers: { origin: 'b.domain' } })
  ).headers;
  assert.equal(headers['access-control-allow-origin'], 'false');
  assert.equal(headers.vary, 'Origin');
  server.close();
});

test('server/udp-tcp#simple-request-async-response', async () => {
  const server = createServer({
    tcp: true,
    udp: true,
    handle(request, send, _info) {
      const [question] = request.questions;
      assert.deepEqual(request.questions, [
        { name: 'test.com', type: 1, class: 1 },
      ]);
      const response = Packet.createResponseFromRequest(request);
      response.answers.push({
        name: question.name,
        type: Packet.TYPE.TXT,
        class: Packet.CLASS.IN,
        ttl: 300,
        data: ['Hello World'],
      });

      new Promise(resolve => setTimeout(() => resolve(), 1)).then(() =>
        send(response),
      );
    },
  });
  const servers = await server.listen();
  assert.ok(servers.udp.port > 1000);
  assert.ok(servers.tcp.port > 1000);
  const tcpClient = TCPClient({ dns: '127.0.0.1', port: servers.tcp.port });
  const udpClient = UDPClient({ dns: '127.0.0.1', port: servers.udp.port });
  const expected = [
    { name: 'test.com', ttl: 300, type: 16, class: 1, data: ['Hello World'] },
  ];
  assert.deepEqual((await tcpClient('test.com')).answers, expected);
  assert.deepEqual((await udpClient('test.com')).answers, expected);
  await server.close();
});

test('server/udp#oversized response sets TC=1 and truncates (RFC 1035 §4.2.1)', async () => {
  const server = createUDPServer();
  server.on('request', (request, send) => {
    const response = Packet.createResponseFromRequest(request);
    // 60 TXT answers with long strings → far past the 512 byte UDP limit.
    for (let i = 0; i < 60; i++) {
      response.answers.push({
        name: request.questions[0].name,
        type: Packet.TYPE.TXT,
        class: Packet.CLASS.IN,
        ttl: 60,
        data: 'x'.repeat(200),
      });
    }
    send(response);
  });
  await server.listen(0, '127.0.0.1');
  const { port } = server.address();

  // Send a non-EDNS query so the server applies the 512-byte ceiling.
  const query = new Packet();
  query.header.id = 0xabcd;
  query.header.rd = 1;
  query.questions.push({
    name: 'big.test',
    type: Packet.TYPE.TXT,
    class: Packet.CLASS.IN,
  });
  const client = udp.createSocket('udp4');
  const reply = await new Promise((resolve, reject) => {
    client.on('message', msg => resolve(msg));
    client.on('error', reject);
    client.send(query.toBuffer(), port, '127.0.0.1');
  });
  await new Promise(resolve => client.close(resolve));
  assert.ok(reply.length <= 512, `reply ${reply.length} bytes must be ≤ 512`);
  const parsed = Packet.parse(reply);
  assert.equal(parsed.header.tc, 1, 'TC bit must be set on truncated reply');
  assert.equal(parsed.header.id, 0xabcd);
  assert.equal(parsed.questions[0].name, 'big.test');
  await new Promise(resolve => server.close(resolve));
});

test('server/udp#EDNS-advertised payload raises UDP ceiling (RFC 6891 §6.2.3)', async () => {
  // When the request carries an OPT record with class=4096, the server may
  // send a response up to 4096 bytes without truncating.
  const server = createUDPServer();
  server.on('request', (request, send) => {
    const response = Packet.createResponseFromRequest(request);
    for (let i = 0; i < 5; i++) {
      response.answers.push({
        name: request.questions[0].name,
        type: Packet.TYPE.TXT,
        class: Packet.CLASS.IN,
        ttl: 60,
        data: 'y'.repeat(200),
      });
    }
    send(response);
  });
  await server.listen(0, '127.0.0.1');
  const { port } = server.address();

  const query = new Packet();
  query.header.id = 0x1234;
  query.header.rd = 1;
  query.questions.push({
    name: 'edns.test',
    type: Packet.TYPE.TXT,
    class: Packet.CLASS.IN,
  });
  query.additionals.push(Packet.Resource.EDNS([], { udpPayloadSize: 4096 }));

  const client = udp.createSocket('udp4');
  const reply = await new Promise((resolve, reject) => {
    client.on('message', msg => resolve(msg));
    client.on('error', reject);
    client.send(query.toBuffer(), port, '127.0.0.1');
  });
  await new Promise(resolve => client.close(resolve));
  assert.ok(
    reply.length > 512,
    `EDNS-advertised payload should permit > 512 bytes; got ${reply.length}`,
  );
  const parsed = Packet.parse(reply);
  assert.equal(
    parsed.header.tc,
    0,
    'no truncation expected within EDNS budget',
  );
  assert.equal(parsed.answers.length, 5);
  await new Promise(resolve => server.close(resolve));
});

test('server/udp#standalone end-to-end query', async () => {
  const server = createUDPServer();
  server.on('request', (request, send) => {
    const response = Packet.createResponseFromRequest(request);
    response.answers.push({
      name: request.questions[0].name,
      type: Packet.TYPE.A,
      class: Packet.CLASS.IN,
      ttl: 60,
      address: '198.51.100.10',
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

test('server/tcp#standalone end-to-end query', async () => {
  const server = createTCPServer();
  server.on('request', (request, send) => {
    const response = Packet.createResponseFromRequest(request);
    response.answers.push({
      name: request.questions[0].name,
      type: Packet.TYPE.A,
      class: Packet.CLASS.IN,
      ttl: 60,
      address: '198.51.100.20',
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

test('server/tcp#async handler still responds when client sends socket.end(frame)', async () => {
  // Regression: a client that bundles query + FIN in a single socket.end()
  // would trigger 'end' on the server before an async handler had a chance
  // to call send(). The server must not half-close its write side while any
  // response is still in flight.
  const server = createTCPServer();
  server.on('request', (request, send) => {
    setTimeout(() => {
      const response = Packet.createResponseFromRequest(request);
      response.answers.push({
        name: request.questions[0].name,
        type: Packet.TYPE.A,
        class: Packet.CLASS.IN,
        ttl: 60,
        address: '203.0.113.99',
      });
      send(response);
    }, 25);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  const query = new Packet();
  query.header.id = 0x9001;
  query.header.rd = 1;
  query.questions.push({
    name: 'end-with-frame.test',
    type: Packet.TYPE.A,
    class: Packet.CLASS.IN,
  });
  const body = query.toBuffer();
  const len = Buffer.alloc(2);
  len.writeUInt16BE(body.length);

  const reply = await new Promise((resolve, reject) => {
    const sock = tcp.connect(port, '127.0.0.1', () => {
      // socket.end(frame) sends both the query data and FIN. The server's
      // 'end' event will fire before the async handler calls send().
      sock.end(Buffer.concat([len, body]));
    });
    let buffered = Buffer.alloc(0);
    sock.on('data', chunk => {
      buffered = Buffer.concat([buffered, chunk]);
      if (buffered.length < 2) return;
      const replyLen = buffered.readUInt16BE(0);
      if (buffered.length < 2 + replyLen) return;
      resolve(Packet.parse(buffered.slice(2, 2 + replyLen)));
    });
    sock.on('error', reject);
    sock.on('close', () => {
      if (buffered.length === 0)
        reject(new Error('connection closed before any response'));
    });
  });

  assert.equal(reply.header.id, 0x9001);
  assert.equal(reply.answers[0].address, '203.0.113.99');
  await new Promise(resolve => server.close(resolve));
});

test('server/tcp#pipelined queries share a connection (RFC 7766 §6.2.1.1)', async () => {
  const server = createTCPServer();
  server.on('request', (request, send) => {
    const response = Packet.createResponseFromRequest(request);
    response.answers.push({
      name: request.questions[0].name,
      type: Packet.TYPE.A,
      class: Packet.CLASS.IN,
      ttl: 60,
      address: '192.0.2.42',
    });
    send(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  // Build two distinct queries and send them back-to-back on one connection
  // without waiting for each reply. The server must process both and write
  // length-prefixed replies on the same socket.
  const queries = ['pipe1.test', 'pipe2.test', 'pipe3.test'].map((name, i) => {
    const q = new Packet();
    q.header.id = 0x1000 + i;
    q.header.rd = 1;
    q.questions.push({ name, type: Packet.TYPE.A, class: Packet.CLASS.IN });
    const body = q.toBuffer();
    const len = Buffer.alloc(2);
    len.writeUInt16BE(body.length);
    return { id: q.header.id, frame: Buffer.concat([len, body]) };
  });

  const replies = await new Promise((resolve, reject) => {
    const sock = tcp.connect(port, '127.0.0.1', () => {
      for (const q of queries) sock.write(q.frame);
    });
    const out = [];
    let buffered = Buffer.alloc(0);
    sock.on('data', chunk => {
      buffered = Buffer.concat([buffered, chunk]);
      while (buffered.length >= 2) {
        const len = buffered.readUInt16BE(0);
        if (buffered.length < 2 + len) break;
        out.push(Packet.parse(buffered.slice(2, 2 + len)));
        buffered = buffered.slice(2 + len);
        if (out.length === queries.length) {
          sock.end();
          resolve(out);
        }
      }
    });
    sock.on('error', reject);
  });

  assert.equal(replies.length, queries.length);
  const ids = replies.map(r => r.header.id).sort();
  assert.deepEqual(ids, queries.map(q => q.id).sort());
  for (const r of replies) {
    assert.equal(r.header.qr, 1);
    assert.equal(r.answers[0].address, '192.0.2.42');
  }
  await new Promise(resolve => server.close(resolve));
});

test('server/doh#GET via DOHClient end-to-end', async () => {
  const server = createDOHServer();
  server.on('request', (request, send) => {
    const response = Packet.createResponseFromRequest(request);
    response.answers.push({
      name: request.questions[0].name,
      type: Packet.TYPE.A,
      class: Packet.CLASS.IN,
      ttl: 60,
      address: '198.51.100.30',
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

test('server/doh#POST end-to-end', async () => {
  const server = createDOHServer();
  server.on('request', (request, send) => {
    const response = Packet.createResponseFromRequest(request);
    response.answers.push({
      name: request.questions[0].name,
      type: Packet.TYPE.TXT,
      class: Packet.CLASS.IN,
      ttl: 60,
      data: ['post-ok'],
    });
    send(response);
  });
  const { port } = await new Promise(resolve => {
    server.on('listening', resolve);
    server.listen();
  });

  const packet = new Packet();
  packet.header.rd = 1;
  packet.questions.push({
    name: 'doh-post.test',
    type: Packet.TYPE.TXT,
    class: Packet.CLASS.IN,
  });

  const body = await new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: '/dns-query',
        method: 'POST',
        headers: {
          accept: 'application/dns-message',
          'content-type': 'application/dns-message',
        },
      },
      res => {
        assert.equal(res.statusCode, 200);
        assert.equal(res.headers['content-type'], 'application/dns-message');
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.end(packet.toBuffer());
  });
  const parsed = Packet.parse(body);
  assert.equal(parsed.answers.length, 1);
  assert.deepEqual(parsed.answers[0].data, ['post-ok']);
  server.close();
});

test('server/doh#405 on unsupported method', async () => {
  const server = createDOHServer();
  const { port } = await new Promise(resolve => {
    server.on('listening', resolve);
    server.listen();
  });
  const { statusCode } = await new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: '/dns-query',
        method: 'PUT',
        headers: { accept: 'application/dns-message' },
      },
      resolve,
    );
    req.on('error', reject);
    req.end();
  });
  assert.equal(statusCode, 405);
  server.close();
});

test('server/doh#404 on unknown path', async () => {
  const server = createDOHServer();
  const { port } = await new Promise(resolve => {
    server.on('listening', resolve);
    server.listen();
  });
  const statusCode = await new Promise((resolve, reject) => {
    http
      .get(
        {
          host: '127.0.0.1',
          port,
          path: '/something-else',
          headers: { accept: 'application/dns-message' },
        },
        res => resolve(res.statusCode),
      )
      .on('error', reject);
  });
  assert.equal(statusCode, 404);
  server.close();
});

test('server/doh#406 on incompatible Accept header', async () => {
  // RFC 8484 §4.1: the client SHOULD send Accept: application/dns-message but
  // the server is not required to reject other values. Only reject when the
  // client explicitly asked for media types that exclude
  // application/dns-message — the server always replies with that type.
  const server = createDOHServer();
  const { port } = await new Promise(resolve => {
    server.on('listening', resolve);
    server.listen();
  });
  const statusCode = await new Promise((resolve, reject) => {
    http
      .get(
        {
          host: '127.0.0.1',
          port,
          path: '/dns-query?dns=abc',
          headers: { accept: 'text/html' },
        },
        res => resolve(res.statusCode),
      )
      .on('error', reject);
  });
  assert.equal(statusCode, 406);
  server.close();
});

test('server/doh#400 on missing dns query param', async () => {
  const server = createDOHServer();
  const { port } = await new Promise(resolve => {
    server.on('listening', resolve);
    server.listen();
  });
  const statusCode = await new Promise((resolve, reject) => {
    http
      .get(
        {
          host: '127.0.0.1',
          port,
          path: '/dns-query',
          headers: { accept: 'application/dns-message' },
        },
        res => resolve(res.statusCode),
      )
      .on('error', reject);
  });
  assert.equal(statusCode, 400);
  server.close();
});

test('server/doh#GET with Accept: */* is accepted (RFC 8484 §4.1)', async () => {
  // curl-style clients send */*; the server must not reject them — it always
  // replies with application/dns-message anyway.
  const server = createDOHServer();
  server.on('request', (request, send) => {
    const response = Packet.createResponseFromRequest(request);
    response.answers.push({
      name: request.questions[0].name,
      type: Packet.TYPE.A,
      class: Packet.CLASS.IN,
      ttl: 60,
      address: '198.51.100.40',
    });
    send(response);
  });
  const { port } = await new Promise(resolve => {
    server.on('listening', resolve);
    server.listen();
  });
  const query = DOHClient({ dns: `http://127.0.0.1:${port}/dns-query` });
  // Routes through DOHClient which sets Accept: application/dns-message;
  // for the */* case we hit the server with a raw http.get.
  const reply = await query('star-accept.test');
  assert.equal(reply.answers[0].address, '198.51.100.40');

  const packet = new Packet();
  packet.header.rd = 1;
  packet.questions.push({
    name: 'star.test',
    type: Packet.TYPE.A,
    class: Packet.CLASS.IN,
  });
  const dns = packet.toBase64URL();
  const status = await new Promise((resolve, reject) => {
    http
      .get(
        {
          host: '127.0.0.1',
          port,
          path: `/dns-query?dns=${dns}`,
          headers: { accept: '*/*' },
        },
        res => resolve(res.statusCode),
      )
      .on('error', reject);
  });
  assert.equal(status, 200);
  server.close();
});

test('server/doh#POST 415 on missing or wrong Content-Type (RFC 8484 §4.1)', async () => {
  const server = createDOHServer();
  const requestErrors = [];
  server.on('request', (request, send) =>
    send(Packet.createResponseFromRequest(request)),
  );
  server.on('requestError', e => requestErrors.push(e));
  const { port } = await new Promise(resolve => {
    server.on('listening', resolve);
    server.listen();
  });
  const sendPost = (contentType, body = Buffer.alloc(12)) =>
    new Promise((resolve, reject) => {
      const headers = { accept: 'application/dns-message' };
      if (contentType) headers['content-type'] = contentType;
      const req = http.request(
        {
          host: '127.0.0.1',
          port,
          path: '/dns-query',
          method: 'POST',
          headers,
        },
        res => resolve({ status: res.statusCode }),
      );
      req.on('error', err => resolve({ error: err }));
      req.end(body);
    });
  assert.equal((await sendPost(undefined)).status, 415, 'missing Content-Type');
  assert.equal(
    (await sendPost('application/json')).status,
    415,
    'wrong Content-Type',
  );
  // With the correct Content-Type the 415 check passes, so a body too short
  // for a DNS header surfaces as a server-side parse error (handler destroys
  // the connection); the client sees a socket-level error, not a 415.
  const malformed = await sendPost('application/dns-message', Buffer.alloc(0));
  assert.ok(
    malformed.error,
    'malformed body should fail at the socket, not return 415',
  );
  assert.ok(
    requestErrors.length >= 1,
    'requestError should have fired for the malformed body',
  );
  server.close();
});

test('server/doh#406 when Accept lists application/dns-message with q=0', async () => {
  // Per RFC 7231 §5.3.1 q=0 means "not acceptable". An entry like
  // application/dns-message;q=0 is an explicit rejection, even though the
  // media range matches.
  const server = createDOHServer();
  const { port } = await new Promise(resolve => {
    server.on('listening', resolve);
    server.listen();
  });
  const status = await new Promise((resolve, reject) => {
    http
      .get(
        {
          host: '127.0.0.1',
          port,
          path: '/dns-query?dns=abc',
          headers: { accept: 'application/dns-message;q=0, text/html' },
        },
        res => resolve(res.statusCode),
      )
      .on('error', reject);
  });
  assert.equal(status, 406);
  server.close();
});

test('server/doh#Cache-Control ignores OPT pseudo-RR TTL (RFC 6891)', async () => {
  // The OPT record's "TTL" field carries flags/extended RCODE; it is almost
  // always 0 and must not drive the min TTL down to zero on cacheable
  // responses.
  const server = createDOHServer();
  server.on('request', (request, send) => {
    const response = Packet.createResponseFromRequest(request);
    response.answers.push({
      name: request.questions[0].name,
      type: Packet.TYPE.A,
      class: Packet.CLASS.IN,
      ttl: 120,
      address: '203.0.113.20',
    });
    // OPT in additionals with the conventional TTL=0. Without the fix, the
    // Cache-Control max-age would collapse to 0.
    response.additionals.push(Packet.Resource.EDNS([]));
    send(response);
  });
  const { port } = await new Promise(resolve => {
    server.on('listening', resolve);
    server.listen();
  });
  const packet = new Packet();
  packet.header.rd = 1;
  packet.questions.push({
    name: 'opt-ttl.test',
    type: Packet.TYPE.A,
    class: Packet.CLASS.IN,
  });
  const dns = packet.toBase64URL();
  const { headers } = await get(
    `http://127.0.0.1:${port}/dns-query?dns=${dns}`,
    {
      headers: { accept: 'application/dns-message' },
    },
  );
  assert.equal(headers['cache-control'], 'max-age=120');
  server.close();
});

test('server/doh#response carries Cache-Control: max-age=<min TTL> (RFC 8484 §5.1)', async () => {
  const server = createDOHServer();
  server.on('request', (request, send) => {
    const response = Packet.createResponseFromRequest(request);
    response.answers.push({
      name: request.questions[0].name,
      type: Packet.TYPE.A,
      class: Packet.CLASS.IN,
      ttl: 300,
      address: '203.0.113.10',
    });
    response.answers.push({
      name: request.questions[0].name,
      type: Packet.TYPE.A,
      class: Packet.CLASS.IN,
      ttl: 30, // minimum across the two answers
      address: '203.0.113.11',
    });
    send(response);
  });
  const { port } = await new Promise(resolve => {
    server.on('listening', resolve);
    server.listen();
  });
  const packet = new Packet();
  packet.header.rd = 1;
  packet.questions.push({
    name: 'cc.test',
    type: Packet.TYPE.A,
    class: Packet.CLASS.IN,
  });
  const dns = packet.toBase64URL();
  const { headers } = await get(
    `http://127.0.0.1:${port}/dns-query?dns=${dns}`,
    {
      headers: { accept: 'application/dns-message' },
    },
  );
  assert.equal(headers['cache-control'], 'max-age=30');
  server.close();
});

test('server/all#multi-question request is preserved through handle', async () => {
  const server = createServer({
    udp: true,
    handle: (request, send) => {
      const response = Packet.createResponseFromRequest(request);
      for (const q of request.questions) {
        response.answers.push({
          name: q.name,
          type: Packet.TYPE.A,
          class: Packet.CLASS.IN,
          ttl: 60,
          address: '127.0.0.1',
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
  request.questions.push({
    name: 'first.multi',
    type: Packet.TYPE.A,
    class: Packet.CLASS.IN,
  });
  request.questions.push({
    name: 'second.multi',
    type: Packet.TYPE.A,
    class: Packet.CLASS.IN,
  });
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

test('server/all#close event fires once all sub-servers close', async () => {
  const server = createServer({
    doh: true,
    tcp: true,
    udp: true,
    handle: () => {},
  });
  await server.listen();
  const closed = new Promise(resolve => server.on('close', resolve));
  await server.close();
  await closed;
});

test('server/all#invalid-request', async () => {
  const server = createServer({
    doh: true,
    tcp: true,
    udp: true,
    handle: () => {},
  });
  const servers = await server.listen();
  assert.ok(servers.udp.port > 1000);
  assert.ok(servers.tcp.port > 1000);
  assert.ok(servers.doh.port > 1000);

  const errors = [];
  server.on('requestError', e => {
    errors.push(e);
  });

  const tcpSocket = tcp.connect({ port: servers.tcp.port, host: '127.0.0.1' });
  tcpSocket.on('connect', () => tcpSocket.end('INVALID'));

  const udpSocket = udp.createSocket('udp4');
  udpSocket.send('INVALID', servers.udp.port, '127.0.0.1', () =>
    udpSocket.close(),
  );

  const dohConn = http
    .get(`http://127.0.0.1:${servers.doh.port}/dns-query?dns=INVALID`, {
      headers: { accept: 'application/dns-message' },
    })
    .on('error', () => {});

  await Promise.all([
    new Promise(resolve => tcpSocket.on('close', resolve)),
    new Promise(resolve => udpSocket.on('close', resolve)),
    new Promise(resolve => dohConn.on('close', resolve)),
  ]);

  assert.equal(errors.length, 3);

  await server.close();
});

test('server/all#handler can respond with RCODE error codes', async () => {
  const server = createServer({
    udp: true,
    tcp: true,
    handle(request, send) {
      const response = Packet.createResponseFromRequest(request);
      const [question] = request.questions;
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

test('server/all#maxConcurrent - requests within limit are served normally', async () => {
  const server = createServer({
    udp: true,
    maxConcurrent: 10,
    handle(request, send) {
      const response = Packet.createResponseFromRequest(request);
      response.answers.push({
        name: request.questions[0].name,
        type: Packet.TYPE.A,
        class: Packet.CLASS.IN,
        ttl: 60,
        address: '1.2.3.4',
      });
      send(response);
    },
  });
  const {
    udp: { port },
  } = await server.listen();
  const client = UDPClient({ dns: '127.0.0.1', port });

  const reply = await client('within-limit.test');
  assert.equal(reply.header.rcode, Packet.RCODE.NOERROR);
  assert.equal(reply.answers[0].address, '1.2.3.4');

  await server.close();
});

test('server/all#maxConcurrent - excess requests receive SERVFAIL', async () => {
  // Use a handler that holds requests open until we release them, so we can
  // saturate the concurrency limit predictably.
  const pending = [];
  const server = createServer({
    udp: true,
    maxConcurrent: 2,
    handle(request, send) {
      pending.push({ request, send });
    },
  });
  const {
    udp: { port },
  } = await server.listen();
  const client = UDPClient({ dns: '127.0.0.1', port });

  // Fire q1 and q2 but don't await — they stay in the handler holding 2 slots.
  const p1 = client('q1.test');
  const p2 = client('q2.test');

  // Wait until both are registered with the handler.
  while (pending.length < 2) await new Promise(r => setTimeout(r, 5));

  // q3 arrives when the limit is already full — should be shed immediately.
  const r3 = await client('q3.test');
  assert.equal(
    r3.header.rcode,
    Packet.RCODE.SERVFAIL,
    'shed request gets SERVFAIL',
  );

  // Drain the two held requests so the server can close cleanly.
  for (const { request, send } of pending) {
    const response = Packet.createResponseFromRequest(request);
    response.header.rcode = Packet.RCODE.NOERROR;
    send(response);
  }
  await Promise.all([p1, p2]);

  await server.close();
});

// ---------------------------------------------------------------------------
// PROXY protocol (issue #81) — UDP and TCP servers expose the real client IP
// when sitting behind an L4 proxy (Nginx stream, HAProxy, etc).
// ---------------------------------------------------------------------------

const proxyProtocol = require('../lib/proxy-protocol');

test('server/udp#proxyProtocol exposes real client address (v2 IPv4)', async () => {
  const server = createUDPServer({ proxyProtocol: true });
  let observedClient;
  server.on('request', (request, send, info) => {
    observedClient = info;
    const response = Packet.createResponseFromRequest(request);
    response.answers.push({
      name: request.questions[0].name,
      type: Packet.TYPE.A,
      class: Packet.CLASS.IN,
      ttl: 60,
      address: '127.0.0.1',
    });
    send(response);
  });
  await server.listen(0, '127.0.0.1');
  const { port: serverPort } = server.address();

  // Build a DNS query and prepend a PROXY v2 IPv4 header naming a fake client.
  const query = new Packet();
  query.header.id = 0x4321;
  query.header.rd = 1;
  query.questions.push({
    name: 'proxied.test',
    type: Packet.TYPE.A,
    class: Packet.CLASS.IN,
  });
  const header = proxyProtocol.buildV2Ipv4({
    sourceAddress: '203.0.113.77',
    destinationAddress: '127.0.0.1',
    sourcePort: 50001,
    destinationPort: serverPort,
    transport: 'DGRAM',
  });
  const datagram = Buffer.concat([header, query.toBuffer()]);

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

test('server/udp#proxyProtocol with missing header emits requestError', async () => {
  const server = createUDPServer({ proxyProtocol: true });
  const requestError = new Promise(resolve =>
    server.once('requestError', resolve),
  );
  await server.listen(0, '127.0.0.1');
  const { port: serverPort } = server.address();

  const query = new Packet();
  query.header.id = 1;
  query.questions.push({
    name: 'noheader.test',
    type: Packet.TYPE.A,
    class: Packet.CLASS.IN,
  });

  const sender = udp.createSocket('udp4');
  await new Promise(resolve =>
    sender.send(query.toBuffer(), serverPort, '127.0.0.1', resolve),
  );
  const captured = await requestError;
  await new Promise(resolve => sender.close(resolve));

  assert.match(captured.message, /PROXY/);
  await new Promise(resolve => server.close(resolve));
});

test('server/tcp#proxyProtocol v1 exposes real client address', async () => {
  const server = createTCPServer({ proxyProtocol: true });
  let observed;
  server.on('request', (request, send, client) => {
    observed = {
      address: client.proxyAddress,
      port: client.proxyPort,
      proxy: client.proxy,
    };
    const response = Packet.createResponseFromRequest(request);
    response.answers.push({
      name: request.questions[0].name,
      type: Packet.TYPE.A,
      class: Packet.CLASS.IN,
      ttl: 60,
      address: '127.0.0.1',
    });
    send(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port: serverPort } = server.address();

  const query = new Packet();
  query.header.id = 0x1111;
  query.questions.push({
    name: 'proxied-tcp.test',
    type: Packet.TYPE.A,
    class: Packet.CLASS.IN,
  });
  const dnsMessage = query.toBuffer();
  const length = Buffer.alloc(2);
  length.writeUInt16BE(dnsMessage.length);
  const proxyHeader = proxyProtocol.buildV1({
    family: 'TCP4',
    sourceAddress: '198.51.100.42',
    destinationAddress: '127.0.0.1',
    sourcePort: 51515,
    destinationPort: serverPort,
  });

  const reply = await readOneTcpReply(
    serverPort,
    Buffer.concat([proxyHeader, length, dnsMessage]),
  );

  assert.equal(reply.header.id, 0x1111);
  assert.equal(reply.answers[0].address, '127.0.0.1');
  assert.equal(observed.address, '198.51.100.42');
  assert.equal(observed.port, 51515);
  assert.equal(observed.proxy.version, 1);
  await new Promise(resolve => server.close(resolve));
});

test('server/tcp#proxyProtocol v2 exposes real client address', async () => {
  const server = createTCPServer({ proxyProtocol: true });
  let observed;
  server.on('request', (request, send, client) => {
    observed = {
      address: client.proxyAddress,
      port: client.proxyPort,
      version: client.proxy.version,
    };
    const response = Packet.createResponseFromRequest(request);
    response.answers.push({
      name: request.questions[0].name,
      type: Packet.TYPE.A,
      class: Packet.CLASS.IN,
      ttl: 60,
      address: '127.0.0.1',
    });
    send(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port: serverPort } = server.address();

  const query = new Packet();
  query.header.id = 0x2222;
  query.questions.push({
    name: 'proxied-tcp-v2.test',
    type: Packet.TYPE.A,
    class: Packet.CLASS.IN,
  });
  const dnsMessage = query.toBuffer();
  const length = Buffer.alloc(2);
  length.writeUInt16BE(dnsMessage.length);
  const proxyHeader = proxyProtocol.buildV2Ipv4({
    sourceAddress: '198.51.100.99',
    destinationAddress: '127.0.0.1',
    sourcePort: 52525,
    destinationPort: serverPort,
  });

  const reply = await readOneTcpReply(
    serverPort,
    Buffer.concat([proxyHeader, length, dnsMessage]),
  );

  assert.equal(reply.header.id, 0x2222);
  assert.equal(observed.address, '198.51.100.99');
  assert.equal(observed.port, 52525);
  assert.equal(observed.version, 2);
  await new Promise(resolve => server.close(resolve));
});

test('server/tcp#proxyProtocol with garbage prefix emits requestError', async () => {
  const server = createTCPServer({ proxyProtocol: true });
  const requestError = new Promise(resolve =>
    server.once('requestError', resolve),
  );
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port: serverPort } = server.address();

  await new Promise((resolve, reject) => {
    const sock = tcp.connect(serverPort, '127.0.0.1', () => {
      sock.end(Buffer.from('GET / HTTP/1.1\r\n\r\n', 'ascii'));
    });
    sock.on('close', resolve);
    sock.on('error', reject);
  });
  const captured = await requestError;

  assert.match(captured.message, /PROXY/);
  await new Promise(resolve => server.close(resolve));
});

test('server/udp/tcp without proxyProtocol still work normally', async () => {
  // Regression guard: enabling the option is opt-in; default behavior unchanged.
  const udpServer = createUDPServer();
  udpServer.on('request', (request, send) => {
    const response = Packet.createResponseFromRequest(request);
    response.answers.push({
      name: request.questions[0].name,
      type: Packet.TYPE.A,
      class: Packet.CLASS.IN,
      ttl: 60,
      address: '10.0.0.1',
    });
    send(response);
  });
  await udpServer.listen(0, '127.0.0.1');
  const udpQuery = UDPClient({
    dns: '127.0.0.1',
    port: udpServer.address().port,
  });
  const udpReply = await udpQuery('plain.test');
  assert.equal(udpReply.answers[0].address, '10.0.0.1');
  await new Promise(resolve => udpServer.close(resolve));

  const tcpServer = createTCPServer();
  tcpServer.on('request', (request, send) => {
    const response = Packet.createResponseFromRequest(request);
    response.answers.push({
      name: request.questions[0].name,
      type: Packet.TYPE.A,
      class: Packet.CLASS.IN,
      ttl: 60,
      address: '10.0.0.2',
    });
    send(response);
  });
  await new Promise(resolve => tcpServer.listen(0, '127.0.0.1', resolve));
  const tcpQuery = TCPClient({
    dns: '127.0.0.1',
    port: tcpServer.address().port,
  });
  const tcpReply = await tcpQuery('plain.test');
  assert.equal(tcpReply.answers[0].address, '10.0.0.2');
  await new Promise(resolve => tcpServer.close(resolve));
});

test('server#requestError explains why a query could not be decoded', async () => {
  const server = createServer({ udp: true, tcp: true, handle: () => {} });
  const servers = await server.listen();
  const errors = [];
  server.on('requestError', e => errors.push(e));
  // Await the event rather than sleeping a fixed interval, which a loaded
  // machine can outrun. If it never arrives the per-test timeout says so.
  const firstError = new Promise(resolve =>
    server.once('requestError', resolve),
  );

  // 8 octets: enough to look like traffic, too few to hold a DNS header.
  const socket = udp.createSocket('udp4');
  await new Promise(resolve =>
    socket.send(Buffer.alloc(8), servers.udp.port, '127.0.0.1', () =>
      socket.close(resolve),
    ),
  );

  const error = await firstError;
  assert.ok(error instanceof Packet.DecodeError);
  assert.match(error.message, /8 octets, too short for the 12-octet header/);
  assert.equal(errors.length, 1, 'one datagram produced one error');

  await server.close();
});

test('server#handler sees a partially decoded request and its errors', async () => {
  // A query whose question is fine but whose additional record is malformed:
  // the handler still gets the question, plus the reason the OPT was dropped.
  const requests = [];
  const server = createUDPServer((request, send) => {
    requests.push(request);
    send(Packet.createResponseFromRequest(request));
  });
  await server.listen(0);
  const { port } = server.address();

  const query = new Packet();
  query.header.id = 0x4242;
  query.questions.push({
    name: 'partial.test',
    type: Packet.TYPE.A,
    class: Packet.CLASS.IN,
  });
  const buffer = query.toBuffer();
  // Append an additional record with a 4-octet RDLENGTH but no rdata, and bump
  // arcount to 1.
  const truncatedOpt = Buffer.from([
    0x00, 0x00, 0x1c, 0x00, 0x01, 0x00, 0x00, 0x00, 0x3c, 0x00, 0x04,
  ]);
  const malformed = Buffer.concat([buffer, truncatedOpt]);
  malformed.writeUInt16BE(1, 10); // arcount

  const socket = udp.createSocket('udp4');
  const reply = new Promise(resolve =>
    socket.on('message', msg => resolve(Packet.parse(msg))),
  );
  socket.send(malformed, port, '127.0.0.1');
  await reply;
  socket.close();

  assert.equal(requests.length, 1);
  const [request] = requests;
  assert.equal(request.questions[0].name, 'partial.test');
  assert.equal(
    request.additionals.length,
    0,
    'the bad record is not delivered',
  );
  assert.equal(request.errors.length, 1);
  assert.equal(request.errors[0].section, 'additionals');
  assert.match(request.errors[0].message, /RDLENGTH 4 but only 0 octet\(s\)/);

  await new Promise(resolve => server.close(resolve));
});

test('client/tcp#reports a reply that is cut short', async () => {
  // A server that frames a 40-octet reply but sends only 4 of them, then
  // closes. The client must say the message was truncated rather than fail
  // somewhere inside the decoder.
  const rude = tcp.createServer(socket => {
    socket.on('data', () => socket.end(Buffer.from([0x00, 0x28, 0x01, 0x02])));
  });
  await new Promise(resolve => rude.listen(0, '127.0.0.1', resolve));
  const { port } = rude.address();

  const resolve4 = TCPClient({ dns: '127.0.0.1', port });
  await assert.rejects(
    resolve4('example.com'),
    /closed after 2 of 40 declared message octet\(s\)/,
  );
  await new Promise(done => rude.close(done));
});

test('server#answers a malformed query with FORMERR and an EDE reason', async () => {
  // End-to-end: a query whose additional record is malformed comes back as
  // FORMERR carrying an RFC 8914 Extended DNS Error naming the reason.
  const server = createUDPServer((request, send) => {
    if (request.errors.length) {
      return send(
        Packet.createErrorResponseFromRequest(request, Packet.RCODE.FORMERR, {
          infoCode: Packet.EDE.INVALID_DATA,
          extraText: request.errors.map(e => e.message).join('; '),
        }),
      );
    }
    send(Packet.createResponseFromRequest(request));
  });
  await server.listen(0, '127.0.0.1');
  const { port } = server.address();

  const query = new Packet();
  query.header.id = 0x7f7f;
  query.questions.push({
    name: 'formerr.test',
    type: Packet.TYPE.A,
    class: Packet.CLASS.IN,
  });
  query.additionals.push(Packet.Resource.EDNS([]));
  // Append an AAAA record declaring 4 octets of rdata but carrying none.
  const malformed = Buffer.concat([
    query.toBuffer(),
    Buffer.from([
      0x00, 0x00, 0x1c, 0x00, 0x01, 0x00, 0x00, 0x00, 0x3c, 0x00, 0x04,
    ]),
  ]);
  malformed.writeUInt16BE(2, 10); // arcount: the OPT plus the broken record

  const socket = udp.createSocket('udp4');
  const reply = new Promise(resolve =>
    socket.on('message', msg => resolve(Packet.parse(msg))),
  );
  socket.send(malformed, port, '127.0.0.1');
  const response = await reply;
  socket.close();

  assert.equal(response.header.id, 0x7f7f);
  assert.equal(response.header.rcode, Packet.RCODE.FORMERR);
  const opt = response.additionals.find(r => r.type === Packet.TYPE.EDNS);
  assert.ok(opt, 'response carries an OPT');
  const [ede] = opt.rdata;
  assert.equal(ede.ednsCode, Packet.EDNS_OPTION_CODE.EDE);
  assert.equal(Packet.EDE_NAME[ede.infoCode], 'INVALID_DATA');
  assert.match(ede.extraText, /RDLENGTH 4 but only 0 octet\(s\) remain/);

  await new Promise(resolve => server.close(resolve));
});
