/**
 * Type-check smoke test for index.d.mts.
 *
 * Mirrors typings-check.ts but exercises the ESM type surface — both the
 * default export and the named exports re-emitted by index.mjs. CI runs
 * `tsc --project ts/tsconfig.mjs.json` and fails if any of these break.
 *
 * Add a line here whenever a new named export is added to index.mjs.
 */

import type { AddressInfo } from 'node:net';

// Default import: the DNS class with all of its statics.
import DNS from './index.mjs';

// Named imports: must resolve to the same values DNS.X resolves to.
import {
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
} from './index.mjs';

// Named type-only imports: the flat namespace some ESM consumers prefer.
import type {
  Header,
  Question,
  Resource,
  DecodeError,
  EdeOption,
  DnsHandler,
  DnsResolver,
  ServerAddresses,
  CreateServerOptions,
} from './index.mjs';

// ── Default-imported DNS instance ────────────────────────────────────────────

const dns = new DNS({ nameServers: ['8.8.8.8'], port: 53, recursive: true });
void dns.resolveA('example.com');
void dns.resolveMX('example.com');

// ── Named factories / constructors ───────────────────────────────────────────

const udpClient: DnsResolver = UDPClient({ dns: '8.8.8.8', port: 53 });
const tcpClient: DnsResolver = TCPClient({ dns: '8.8.8.8' });
const dohClient: DnsResolver = DOHClient({ dns: 'https://cloudflare-dns.com/dns-query' });
const googleClient: DnsResolver = GoogleClient();
void udpClient('example.com', 'A');
void tcpClient('example.com', 'MX');
void dohClient('example.com', 'AAAA');
void googleClient('example.com');

const udpServer: UDPServer = createUDPServer({ type: 'udp4' });
const tcpServer: TCPServer = createTCPServer();
const dohServer: DOHServer = createDOHServer({ ssl: false, cors: true });

const handler: DnsHandler = (req, send) => {
  void send(Packet.createResponseFromRequest(req));
};
udpServer.on('request', handler);
tcpServer.on('request', handler);
dohServer.on('request', handler);

// ── Multi-server via createServer ────────────────────────────────────────────

const opts: CreateServerOptions = {
  udp: true,
  tcp: true,
  doh: { ssl: false },
  maxConcurrent: 100,
  handle: handler,
};
const server = createServer(opts);
server.listen({ udp: { port: 53 }, tcp: 5353 }).then((addrs: ServerAddresses) => {
  const _udp: AddressInfo | undefined = addrs.udp;
});
void server.close();

// ── Packet construction via the named import ─────────────────────────────────

const pkt = new Packet();
pkt.header.id = 0xabcd;
pkt.questions.push(new Packet.Question('esm.test', Packet.TYPE.A, Packet.CLASS.IN));
const buf: Buffer = pkt.toBuffer();
const parsed: Packet = Packet.parse(buf);

const decodeErrors: DecodeError[] = parsed.errors;
const _ede: EdeOption = Packet.Resource.EDNS.EDE(Packet.EDE.INVALID_DATA, 'why');
const _formErr: Packet = Packet.createErrorResponseFromRequest(
  parsed,
  Packet.RCODE.FORMERR,
  { infoCode: _ede.infoCode, extraText: _ede.extraText },
);
void _formErr.additionals.length;
void decodeErrors.map(e => `${e.section}: ${e.message} (recovered=${e.recovered})`);

const hdr: Header = parsed.header;
const q: Question = parsed.questions[0];
const ans: Resource | undefined = parsed.answers[0];
void hdr.id;
void q.name;
void ans?.address;

// ── Cross-check: named export ≡ DNS.X ────────────────────────────────────────

const _packetSame: typeof DNS.Packet = Packet;
const _createServerSame: typeof DNS.createServer = createServer;
const _tcpClientSame: typeof DNS.TCPClient = TCPClient;
