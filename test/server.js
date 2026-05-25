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

test.skip('BUG: server/doh#POST end-to-end', async() => {
  // server/doh.js#readStream collects the request body via string
  // concatenation (`buffer += chunk`), which decodes incoming chunks as utf-8.
  // Binary DNS payloads contain bytes that aren't valid utf-8 and get mangled,
  // so Packet.parse throws and the server destroys the socket — the client
  // sees a "socket hang up". Fix: collect chunks as Buffer (push into an
  // array, then Buffer.concat on 'end').
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
