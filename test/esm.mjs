import assert from 'node:assert';
import { test } from 'node:test';
import dns, {
  Packet,
  TCPClient,
  UDPClient,
  DOHClient,
  GoogleClient,
  TCPServer,
  UDPServer,
  DOHServer,
  createServer,
  createUDPServer,
  createTCPServer,
  createDOHServer,
} from '../index.mjs';

test('esm: default export is the DNS class', () => {
  assert.equal(typeof dns, 'function');
  assert.equal(dns.name, 'DNS');
});

test('esm: named exports mirror DNS.* statics', () => {
  for (const [name, value] of Object.entries({
    Packet,
    TCPClient,
    UDPClient,
    DOHClient,
    GoogleClient,
    TCPServer,
    UDPServer,
    DOHServer,
    createServer,
    createUDPServer,
    createTCPServer,
    createDOHServer,
  })) {
    assert.strictEqual(
      value,
      dns[name],
      `${name} should be the same reference`,
    );
  }
});

test('esm: Packet round-trips a request', () => {
  const pkt = new Packet();
  pkt.header.id = 0x2026;
  pkt.questions.push({
    name: 'esm.example',
    type: Packet.TYPE.A,
    class: Packet.CLASS.IN,
  });
  const parsed = Packet.parse(pkt.toBuffer());
  assert.equal(parsed.header.id, 0x2026);
  assert.equal(parsed.questions[0].name, 'esm.example');
});

test('esm: UDP server + client end-to-end', async () => {
  const server = createUDPServer();
  server.on('request', (request, send) => {
    const response = Packet.createResponseFromRequest(request);
    response.answers.push({
      name: request.questions[0].name,
      type: Packet.TYPE.A,
      class: Packet.CLASS.IN,
      ttl: 60,
      address: '198.51.100.123',
    });
    send(response);
  });
  await server.listen(0, '127.0.0.1');
  const { port } = server.address();
  const query = UDPClient({ dns: '127.0.0.1', port });
  const reply = await query('esm-client.test');
  assert.equal(reply.answers[0].address, '198.51.100.123');
  await new Promise(resolve => server.close(resolve));
});
