const assert = require('node:assert/strict');
const test = require('node:test');
const { Packet } = require('..');

function roundTrip(...answers) {
  const packet = new Packet();
  packet.header.qr = 1;
  packet.questions.push({
    name: 'example.com',
    type: answers[0].type,
    class: Packet.CLASS.IN,
  });
  packet.answers = answers.map(answer => ({
    name: 'example.com',
    class: Packet.CLASS.IN,
    ttl: 300,
    ...answer,
  }));
  const parsed = Packet.parse(packet.toBuffer());
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.answers.length, answers.length);
  return parsed.answers;
}

test('TXT and SPF split strings longer than 255 octets', () => {
  for (const type of [Packet.TYPE.TXT, Packet.TYPE.SPF]) {
    for (const size of [0, 1, 254, 255, 256, 510, 511, 1024]) {
      const data = 'x'.repeat(size);
      const [answer] = roundTrip({ type, data });
      const expected =
        size === 0
          ? ['']
          : Array.from({ length: Math.ceil(size / 255) }, (_, index) =>
              data.slice(index * 255, (index + 1) * 255),
            );
      assert.deepEqual(answer.data, expected, `type=${type}, size=${size}`);
    }
  }
});

test('TXT splitting preserves UTF-8 characters and explicit boundaries', () => {
  // The first emoji straddles the 255-octet boundary.
  const utf8 = 'a'.repeat(254) + '💡' + 'é'.repeat(130);
  const [answer] = roundTrip({
    type: Packet.TYPE.TXT,
    data: ['first', utf8, Buffer.from('z'.repeat(256)), '', 'last'],
  });
  assert.equal(answer.data[0], 'first');
  assert.equal(answer.data.at(-2), '');
  assert.equal(answer.data.at(-1), 'last');
  assert.equal(answer.data.slice(1, -4).join(''), utf8);
  assert.deepEqual(answer.data.slice(-4, -2), ['z'.repeat(255), 'z']);
  assert.ok(answer.data.every(s => Buffer.byteLength(s, 'utf8') <= 255));
});

test('oversized TXT does not misalign the following resource record', () => {
  const [txt, address] = roundTrip(
    { type: Packet.TYPE.TXT, data: 'k'.repeat(600) },
    { type: Packet.TYPE.A, address: '192.0.2.10' },
  );
  assert.equal(txt.data.join(''), 'k'.repeat(600));
  assert.equal(address.address, '192.0.2.10');
});

test('TXT RDATA beyond 65535 octets fails instead of truncating RDLENGTH', () => {
  const packet = new Packet();
  packet.answers.push({
    name: 'example.com',
    type: Packet.TYPE.TXT,
    class: Packet.CLASS.IN,
    ttl: 60,
    data: 'x'.repeat(65280), // 256 chunks of 255 plus 256 length octets
  });
  assert.throws(() => packet.toBuffer(), /RDATA length 65536 exceeds 65535/);
});

test('AAAA encodes mixed IPv6/IPv4 text as exactly 16 octets', () => {
  const cases = [
    ['::ffff:192.0.2.1', '::ffff:c000:201', '00000000000000000000ffffc0000201'],
    ['0:0:0:0:0:ffff:192.0.2.1', '::ffff:c000:201', '00000000000000000000ffffc0000201'],
    ['2001:db8::192.0.2.1', '2001:db8::c000:201', '20010db80000000000000000c0000201'],
    ['::192.0.2.1', '::c000:201', '000000000000000000000000c0000201'],
  ];
  for (const [input, expectedText, expectedHex] of cases) {
    const packet = new Packet();
    packet.answers.push({
      name: 'example.com',
      type: Packet.TYPE.AAAA,
      class: Packet.CLASS.IN,
      ttl: 60,
      address: input,
    });
    const wire = packet.toBuffer();
    assert.equal(wire.subarray(-16).toString('hex'), expectedHex, input);
    const parsed = Packet.parse(wire);
    assert.equal(parsed.errors.length, 0, input);
    assert.equal(parsed.answers[0].address, expectedText, input);
    assert.equal(Packet.fromIPv6(input).length, 8, input);
  }
});

test('EDNS ECS shares AAAA mixed IPv6 parsing for /128 and /96', () => {
  const expected = Buffer.from('00000000000000000000ffffc0000201', 'hex');
  for (const address of [
    '::ffff:192.0.2.1',
    '0:0:0:0:0:ffff:192.0.2.1',
  ]) {
    for (const bits of [96, 128]) {
      const opt = new Packet.Resource.EDNS([{
        ednsCode: Packet.EDNS_OPTION_CODE.ECS,
        family: 2,
        sourcePrefixLength: bits,
        scopePrefixLength: 0,
        ip: address,
      }]);
      const wire = Packet.Resource.encode(opt);
      const octets = bits / 8;
      assert.deepEqual(wire.subarray(-octets), expected.subarray(0, octets));
      const parsed = Packet.Resource.decode(wire);
      assert.equal(parsed.rdata[0].family, 2);
      assert.equal(parsed.rdata[0].sourcePrefixLength, bits);
      if (bits === 128) {
        assert.equal(parsed.rdata[0].ip, '0:0:0:0:0:ffff:c000:201');
      }
    }
  }
});

test('fromIPv6 and ECS reject malformed mixed IPv6 addresses', () => {
  const invalid = '::ffff:999.2.3.4';
  assert.throws(() => Packet.fromIPv6(invalid), /invalid IPv6 address/);
  const opt = new Packet.Resource.EDNS([{
    ednsCode: Packet.EDNS_OPTION_CODE.ECS,
    family: 2,
    sourcePrefixLength: 128,
    scopePrefixLength: 0,
    ip: invalid,
  }]);
  assert.throws(() => Packet.Resource.encode(opt), /invalid IPv6 address/);
});
