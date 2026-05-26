const assert = require('node:assert');
const test = require('./test');
const proxy = require('../lib/proxy-protocol');

test('proxy v1: TCP4 header parses', function () {
  const buf = Buffer.from(
    'PROXY TCP4 203.0.113.5 198.51.100.1 56324 53\r\n',
    'ascii',
  );
  const { header, headerLength } = proxy.parse(buf);
  assert.equal(header.version, 1);
  assert.equal(header.command, 'PROXY');
  assert.equal(header.family, 'IPv4');
  assert.equal(header.sourceAddress, '203.0.113.5');
  assert.equal(header.sourcePort, 56324);
  assert.equal(header.destinationAddress, '198.51.100.1');
  assert.equal(header.destinationPort, 53);
  assert.equal(headerLength, buf.length);
});

test('proxy v1: TCP6 header parses', function () {
  const buf = Buffer.from(
    'PROXY TCP6 2001:db8::1 2001:db8::2 49152 53\r\n',
    'ascii',
  );
  const { header } = proxy.parse(buf);
  assert.equal(header.family, 'IPv6');
  assert.equal(header.sourceAddress, '2001:db8::1');
  assert.equal(header.destinationAddress, '2001:db8::2');
  assert.equal(header.sourcePort, 49152);
});

test('proxy v1: UNKNOWN protocol parses without address info', function () {
  const buf = Buffer.from('PROXY UNKNOWN\r\n', 'ascii');
  const { header, headerLength } = proxy.parse(buf);
  assert.equal(header.version, 1);
  assert.equal(header.command, 'UNKNOWN');
  assert.equal(header.sourceAddress, undefined);
  assert.equal(headerLength, buf.length);
});

test('proxy v1: payload after header is preserved via headerLength', function () {
  const header = 'PROXY TCP4 1.2.3.4 5.6.7.8 1024 53\r\n';
  const payload = Buffer.from([0x00, 0x01, 0x02, 0x03]);
  const buf = Buffer.concat([Buffer.from(header, 'ascii'), payload]);
  const { headerLength } = proxy.parse(buf);
  assert.deepEqual(buf.slice(headerLength), payload);
});

test('proxy v1: incomplete header (no \\r\\n yet) returns null', function () {
  const buf = Buffer.from('PROXY TCP4 1.2.3.4', 'ascii');
  assert.equal(proxy.parse(buf), null);
});

test('proxy v1: oversized header without terminator throws', function () {
  // V1 max line length is 108; build something past that with no \r\n.
  const buf = Buffer.from('PROXY ' + 'x'.repeat(200), 'ascii');
  assert.throws(() => proxy.parse(buf), /exceeds maximum length/);
});

test('proxy v2: IPv4 PROXY header parses', function () {
  const buf = proxy.buildV2Ipv4({
    sourceAddress: '203.0.113.99',
    destinationAddress: '198.51.100.1',
    sourcePort: 51000,
    destinationPort: 53,
  });
  const { header, headerLength } = proxy.parse(buf);
  assert.equal(header.version, 2);
  assert.equal(header.command, 'PROXY');
  assert.equal(header.family, 'IPv4');
  assert.equal(header.transport, 'STREAM');
  assert.equal(header.sourceAddress, '203.0.113.99');
  assert.equal(header.sourcePort, 51000);
  assert.equal(header.destinationAddress, '198.51.100.1');
  assert.equal(header.destinationPort, 53);
  assert.equal(headerLength, 28);
});

test('proxy v2: incomplete header (signature only) returns null', function () {
  const sig = Buffer.from([
    0x0d, 0x0a, 0x0d, 0x0a, 0x00, 0x0d, 0x0a, 0x51, 0x55, 0x49, 0x54, 0x0a,
  ]);
  assert.equal(proxy.parse(sig), null);
});

test('proxy v2: payload after header is preserved via headerLength', function () {
  const header = proxy.buildV2Ipv4({
    sourceAddress: '10.0.0.1',
    destinationAddress: '10.0.0.2',
    sourcePort: 12345,
    destinationPort: 53,
  });
  const payload = Buffer.from([0xab, 0xcd, 0xef]);
  const buf = Buffer.concat([header, payload]);
  const parsed = proxy.parse(buf);
  assert.deepEqual(buf.slice(parsed.headerLength), payload);
});

test('proxy v2: LOCAL command is recognized without address info', function () {
  const buf = Buffer.alloc(16);
  Buffer.from([
    0x0d, 0x0a, 0x0d, 0x0a, 0x00, 0x0d, 0x0a, 0x51, 0x55, 0x49, 0x54, 0x0a,
  ]).copy(buf, 0);
  buf[12] = 0x20; // version 2 | LOCAL command (0)
  buf[13] = 0x00; // AF_UNSPEC
  buf.writeUInt16BE(0, 14);
  const { header } = proxy.parse(buf);
  assert.equal(header.version, 2);
  assert.equal(header.command, 'LOCAL');
});

test('proxy: unrelated bytes throw "header missing or malformed"', function () {
  const buf = Buffer.from('GET / HTTP/1.1\r\n', 'ascii');
  assert.throws(() => proxy.parse(buf), /header missing or malformed/);
});

test('proxy: empty buffer needs more (returns null via prefix match)', function () {
  // V1_PREFIX.slice(0,0).equals(Buffer.alloc(0)) is true, so empty bytes
  // are treated as "incomplete v1 header" rather than malformed.
  assert.equal(proxy.parse(Buffer.alloc(0)), null);
});
