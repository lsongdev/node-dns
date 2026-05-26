'use strict';

// PROXY protocol parser (HAProxy/Nginx).
// Spec: https://www.haproxy.org/download/1.8/doc/proxy-protocol.txt
//
// parse(buffer) returns:
//   - { header, headerLength } when a complete header is at the start of buffer
//   - null when the buffer is a valid prefix but more bytes are needed
// and throws when the bytes are not a valid PROXY header.

const V2_SIGNATURE = Buffer.from([
  0x0d, 0x0a, 0x0d, 0x0a, 0x00, 0x0d, 0x0a, 0x51, 0x55, 0x49, 0x54, 0x0a,
]);
const V1_PREFIX = Buffer.from('PROXY ');
const V1_MAX_LEN = 108;

const FAMILY = { 0x10: 'IPv4', 0x20: 'IPv6', 0x30: 'Unix' };
const TRANSPORT = { 0x01: 'STREAM', 0x02: 'DGRAM' };

function parse(buffer) {
  if (buffer.length >= 12) {
    if (buffer.slice(0, 12).equals(V2_SIGNATURE)) return parseV2(buffer);
  } else if (V2_SIGNATURE.slice(0, buffer.length).equals(buffer)) {
    return null;
  }

  if (buffer.length >= 6) {
    if (buffer.slice(0, 6).equals(V1_PREFIX)) return parseV1(buffer);
  } else if (V1_PREFIX.slice(0, buffer.length).equals(buffer)) {
    return null;
  }

  throw new Error('PROXY protocol: header missing or malformed');
}

function parseV1(buffer) {
  const search = buffer.slice(0, Math.min(buffer.length, V1_MAX_LEN));
  const newline = search.indexOf('\r\n');
  if (newline === -1) {
    if (buffer.length >= V1_MAX_LEN) {
      throw new Error('PROXY v1: header exceeds maximum length');
    }
    return null;
  }
  const line = buffer.slice(0, newline).toString('ascii');
  const parts = line.split(' ');
  if (parts[0] !== 'PROXY') throw new Error('PROXY v1: malformed header');
  const headerLength = newline + 2;

  if (parts[1] === 'UNKNOWN') {
    return { header: { version: 1, command: 'UNKNOWN' }, headerLength };
  }
  if (parts.length !== 6) throw new Error('PROXY v1: malformed header');
  const [, proto, sourceAddress, destinationAddress, srcPort, dstPort] = parts;
  if (proto !== 'TCP4' && proto !== 'TCP6') {
    throw new Error(`PROXY v1: unsupported protocol ${proto}`);
  }
  return {
    header: {
      version: 1,
      command: 'PROXY',
      family: proto === 'TCP4' ? 'IPv4' : 'IPv6',
      transport: 'STREAM',
      sourceAddress,
      sourcePort: parseInt(srcPort, 10),
      destinationAddress,
      destinationPort: parseInt(dstPort, 10),
    },
    headerLength,
  };
}

function parseV2(buffer) {
  if (buffer.length < 16) return null;
  const verCmd = buffer[12];
  const version = verCmd >> 4;
  const command = verCmd & 0x0f;
  if (version !== 2)
    throw new Error(`PROXY v2: unsupported version ${version}`);
  if (command !== 0 && command !== 1) {
    throw new Error(`PROXY v2: unknown command ${command}`);
  }

  const famProto = buffer[13];
  const addressLength = buffer.readUInt16BE(14);
  const headerLength = 16 + addressLength;
  if (buffer.length < headerLength) return null;

  if (command === 0) {
    // LOCAL — no real client info (e.g. proxy-originated health check).
    return { header: { version: 2, command: 'LOCAL' }, headerLength };
  }

  const family = FAMILY[famProto & 0xf0];
  const transport = TRANSPORT[famProto & 0x0f];

  let sourceAddress, destinationAddress, sourcePort, destinationPort;
  if (family === 'IPv4' && addressLength >= 12) {
    sourceAddress = `${buffer[16]}.${buffer[17]}.${buffer[18]}.${buffer[19]}`;
    destinationAddress = `${buffer[20]}.${buffer[21]}.${buffer[22]}.${buffer[23]}`;
    sourcePort = buffer.readUInt16BE(24);
    destinationPort = buffer.readUInt16BE(26);
  } else if (family === 'IPv6' && addressLength >= 36) {
    sourceAddress = ipv6FromBytes(buffer.slice(16, 32));
    destinationAddress = ipv6FromBytes(buffer.slice(32, 48));
    sourcePort = buffer.readUInt16BE(48);
    destinationPort = buffer.readUInt16BE(50);
  } else {
    throw new Error(
      `PROXY v2: unsupported address family/protocol 0x${famProto.toString(16)}`,
    );
  }

  return {
    header: {
      version: 2,
      command: 'PROXY',
      family,
      transport,
      sourceAddress,
      sourcePort,
      destinationAddress,
      destinationPort,
    },
    headerLength,
  };
}

function ipv6FromBytes(bytes) {
  const segments = [];
  for (let i = 0; i < 16; i += 2) {
    segments.push(bytes.readUInt16BE(i).toString(16));
  }
  return segments.join(':');
}

// Test helpers — build wire-format headers used by tests and example code.
function buildV1({
  family = 'TCP4',
  sourceAddress,
  destinationAddress,
  sourcePort,
  destinationPort,
}) {
  return Buffer.from(
    `PROXY ${family} ${sourceAddress} ${destinationAddress} ${sourcePort} ${destinationPort}\r\n`,
    'ascii',
  );
}

function buildV2Ipv4({
  sourceAddress,
  destinationAddress,
  sourcePort,
  destinationPort,
  transport = 'STREAM',
}) {
  const buf = Buffer.alloc(16 + 12);
  V2_SIGNATURE.copy(buf, 0);
  buf[12] = 0x21; // version 2 | PROXY command
  buf[13] = 0x10 | (transport === 'DGRAM' ? 0x02 : 0x01); // IPv4 | STREAM/DGRAM
  buf.writeUInt16BE(12, 14);
  sourceAddress.split('.').forEach((o, i) => {
    buf[16 + i] = parseInt(o, 10);
  });
  destinationAddress.split('.').forEach((o, i) => {
    buf[20 + i] = parseInt(o, 10);
  });
  buf.writeUInt16BE(sourcePort, 24);
  buf.writeUInt16BE(destinationPort, 26);
  return buf;
}

module.exports = { parse, parseV1, parseV2, buildV1, buildV2Ipv4 };
