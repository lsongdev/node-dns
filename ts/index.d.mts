// ESM-shaped types for the index.mjs wrapper. The runtime surface and the CJS
// types both live in their own files; this re-exports those types so that
// `import dns, { Packet, createServer } from 'dns2'` is fully typed under
// `moduleResolution: node16 | nodenext | bundler`.

import DNS from './index.js';

export default DNS;

// ── Value re-exports (mirror index.mjs's destructured exports) ───────────────

export const Packet: typeof DNS.Packet;
export const TCPClient: typeof DNS.TCPClient;
export const UDPClient: typeof DNS.UDPClient;
export const DOHClient: typeof DNS.DOHClient;
export const GoogleClient: typeof DNS.GoogleClient;
export const TCPServer: typeof DNS.TCPServer;
export const UDPServer: typeof DNS.UDPServer;
export const DOHServer: typeof DNS.DOHServer;
export const createServer: typeof DNS.createServer;
export const createUDPServer: typeof DNS.createUDPServer;
export const createTCPServer: typeof DNS.createTCPServer;
export const createDOHServer: typeof DNS.createDOHServer;

// ── Type re-exports (for `import type { ... } from 'dns2'`) ──────────────────

export type Packet = DNS.Packet;
export type TCPServer = DNS.TCPServer;
export type UDPServer = DNS.UDPServer;
export type DOHServer = DNS.DOHServer;
export type DnsServer = DNS.DnsServer;

export type DnsHandler = DNS.DnsHandler;
export type DnsResolver = DNS.DnsResolver;

export type ClientOptions = DNS.ClientOptions;
export type ResolveOptions = DNS.ResolveOptions;
export type UdpClientOptions = DNS.UdpClientOptions;
export type TcpClientOptions = DNS.TcpClientOptions;
export type DohClientOptions = DNS.DohClientOptions;
export type UdpServerOptions = DNS.UdpServerOptions;
export type DohServerOptions = DNS.DohServerOptions;
export type CreateServerOptions = DNS.CreateServerOptions;
export type ServerAddresses = DNS.ServerAddresses;
export type DnsServerListenOptions = DNS.DnsServerListenOptions;
export type ListenOptions = DNS.ListenOptions;

// Sub-types nested under Packet for callers that prefer the flat namespace.
export type Header = DNS.Packet.Header;
export type Question = DNS.Packet.Question;
export type Resource = DNS.Packet.Resource;
export type Reader = DNS.Packet.Reader;
export type Writer = DNS.Packet.Writer;
