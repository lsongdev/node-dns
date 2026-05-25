/**
 * Type-check smoke test for index.d.ts.
 *
 * This file is NOT executed at runtime. It exists solely so that `tsc` can
 * verify that index.d.ts accurately describes the package's public API.
 * CI runs `tsc --project tsconfig.json` and fails if there are type errors.
 *
 * Add a line here whenever a new public API surface is added to index.js.
 */

import DNS = require('./index');
import type { AddressInfo } from 'node:net';

const { Packet } = DNS;

// ── DNS instance (high-level resolver) ────────────────────────────────────────

const dns = new DNS({ nameServers: ['8.8.8.8'], port: 53, recursive: true });

void dns.resolve('example.com', 'A');
void dns.resolveA('example.com');
void dns.resolveA('example.com', '1.2.3.4');
void dns.resolveAAAA('example.com');
void dns.resolveMX('example.com');
void dns.resolveCNAME('www.example.com');
void dns.resolvePTR('1.0.0.127.in-addr.arpa');
void dns.resolveDNSKEY('example.com');
void dns.resolveRRSIG('example.com');

dns.resolve('example.com').then((packet: DNS.Packet) => {
  const hdr: DNS.Packet.Header = packet.header;
  const _id: number = hdr.id;
  const _rc: number = hdr.rcode;
  const answer: DNS.Packet.Resource = packet.answers[0];
  const _addr: string | undefined = answer.address;
  const _ttl: number = answer.ttl;
});

// ── Packet static constants ───────────────────────────────────────────────────

const _typeA: number = Packet.TYPE.A;
const _typeAAAA: number = Packet.TYPE.AAAA;
const _typeMX: number = Packet.TYPE.MX;
const _typeDNSKEY: number = Packet.TYPE.DNSKEY;
const _classIN: number = Packet.CLASS.IN;
const _ecsCode: number = Packet.EDNS_OPTION_CODE.ECS;

// ── Packet static helpers ─────────────────────────────────────────────────────

const buf = Buffer.alloc(12);
const parsed: DNS.Packet = Packet.parse(buf);
const response: DNS.Packet = Packet.createResponseFromRequest(parsed);
response.header.rcode = 3; // NXDOMAIN

const q: DNS.Packet.Question = parsed.questions[0];
if (q) {
  Packet.createResourceFromQuestion(q, { address: '1.2.3.4', ttl: 60 });
}

// ── Packet encode / round-trip ────────────────────────────────────────────────

const pkt = new Packet();
pkt.header.qr = 1;
const encoded: Buffer = pkt.toBuffer();
Packet.parse(encoded);

// ── Multi-server (DnsServer) ──────────────────────────────────────────────────

const server: DNS.DnsServer = DNS.createServer({
  udp: true,
  tcp: true,
  maxConcurrent: 100,
  handle: (request, send, _client) => {
    const res = Packet.createResponseFromRequest(request);
    res.header.rcode = 5; // REFUSED
    void send(res);
  },
});

server.listen({ udp: { port: 53 }, tcp: 5353 }).then((addrs: DNS.ServerAddresses) => {
  const _udp: AddressInfo | undefined = addrs.udp;
});

server.on('request', (req, send, _client) => {
  void send(Packet.createResponseFromRequest(req));
});

server.on('error', (err: Error, transport: 'udp' | 'tcp' | 'doh') => {
  void err;
  void transport;
});

void server.close();

// ── Individual server factories ───────────────────────────────────────────────

const udpServer: DNS.UDPServer = DNS.createUDPServer({ type: 'udp4' });
udpServer.on('request', (req, send) => { void send(req); });

const tcpServer: DNS.TCPServer = DNS.createTCPServer();
tcpServer.on('request', (req, send) => { void send(req); });

const dohServer: DNS.DOHServer = DNS.createDOHServer({ ssl: false, cors: true });
dohServer.on('request', (req, send) => { void send(req); });

// ── Client factories ──────────────────────────────────────────────────────────

const udpClient: DNS.DnsResolver = DNS.UDPClient({ dns: '8.8.8.8', port: 53 });
const tcpClient: DNS.DnsResolver = DNS.TCPClient({ dns: '8.8.8.8', protocol: 'tcp:' });
const dohClient: DNS.DnsResolver = DNS.DOHClient({ dns: 'https://cloudflare-dns.com/dns-query' });
const googleClient: DNS.DnsResolver = DNS.GoogleClient();

void udpClient('example.com', 'A');
void tcpClient('example.com', 'MX');
void dohClient('example.com', 'AAAA');
void googleClient('example.com');

// ── Sub-class type assignability ──────────────────────────────────────────────

const _dnsServer: DNS.DnsServer = DNS.createServer({ udp: true });
const _udp: DNS.UDPServer = DNS.createUDPServer();
const _tcp: DNS.TCPServer = DNS.createTCPServer();
const _doh: DNS.DOHServer = DNS.createDOHServer();
