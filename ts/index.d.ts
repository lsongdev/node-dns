/// <reference types="node" />

import * as dgram from 'node:dgram';
import { EventEmitter } from 'node:events';
import * as http from 'node:http';
import * as net from 'node:net';

// ─── Main DNS class ───────────────────────────────────────────────────────────

declare class DNS extends EventEmitter {
  constructor(options?: Partial<DNS.ClientOptions>);

  resolve(
    domain: string,
    type?: string,
    cls?: number,
    options?: DNS.ResolveOptions,
  ): Promise<DNS.Packet>;

  resolveA(domain: string, clientIp?: string): Promise<DNS.Packet>;
  resolveAAAA(domain: string): Promise<DNS.Packet>;
  resolveMX(domain: string): Promise<DNS.Packet>;
  resolveCNAME(domain: string): Promise<DNS.Packet>;
  resolvePTR(domain: string): Promise<DNS.Packet>;
  resolveDNSKEY(domain: string): Promise<DNS.Packet>;
  resolveRRSIG(domain: string): Promise<DNS.Packet>;
  resolveSOA(domain: string): Promise<DNS.Packet>;

  static createServer(options: DNS.CreateServerOptions): DNS.DnsServer;
  static createUDPServer(options?: DNS.UdpServerOptions | DNS.DnsHandler): DNS.UDPServer;
  static createTCPServer(options?: DNS.DnsHandler): DNS.TCPServer;
  static createDOHServer(options?: DNS.DohServerOptions): DNS.DOHServer;

  static UDPClient(options?: DNS.UdpClientOptions): DNS.DnsResolver;
  static TCPClient(options?: DNS.TcpClientOptions): DNS.DnsResolver;
  static DOHClient(options?: DNS.DohClientOptions): DNS.DnsResolver;
  static GoogleClient(): DNS.DnsResolver;
}

// ─── Namespace (all exported sub-types live here) ─────────────────────────────

declare namespace DNS {

  // ── Packet ──────────────────────────────────────────────────────────────────

  class Packet {
    header: Packet.Header;
    questions: Packet.Question[];
    answers: Packet.Resource[];
    authorities: Packet.Resource[];
    additionals: Packet.Resource[];
    recursive: boolean;

    constructor(
      data?: Packet | Packet.Header | Packet.Question | Packet.Resource | string | any[],
    );

    toBuffer(): Buffer;
    toBase64URL(): string;

    // ── Static constants ────────────────────────────────────────────────────

    static TYPE: {
      A      : 0x01;
      NS     : 0x02;
      MD     : 0x03;
      MF     : 0x04;
      CNAME  : 0x05;
      SOA    : 0x06;
      MB     : 0x07;
      MG     : 0x08;
      MR     : 0x09;
      NULL   : 0x0a;
      WKS    : 0x0b;
      PTR    : 0x0c;
      HINFO  : 0x0d;
      MINFO  : 0x0e;
      MX     : 0x0f;
      TXT    : 0x10;
      AAAA   : 0x1c;
      SRV    : 0x21;
      EDNS   : 0x29;
      SPF    : 0x63;
      AXFR   : 0xfc;
      MAILB  : 0xfd;
      MAILA  : 0xfe;
      ANY    : 0xff;
      CAA    : 0x101;
      DNSKEY : 0x30;
    };

    static CLASS: {
      IN  : 0x01;
      CS  : 0x02;
      CH  : 0x03;
      HS  : 0x04;
      ANY : 0xff;
    };

    static EDNS_OPTION_CODE: {
      ECS: 0x08;
    };

    // ── Static helpers ──────────────────────────────────────────────────────

    static parse(buffer: Buffer): Packet;
    static createResponseFromRequest(request: Packet): Packet;
    static createResourceFromQuestion(
      base: Packet.Question,
      record: Partial<Packet.Resource>,
    ): Packet.Resource;
    static readStream(socket: NodeJS.ReadableStream): Promise<Buffer>;
    static toIPv6(parts: number[]): string;
    static fromIPv6(address: string): string[];
    static uuid(): number;

    // ── Sub-constructors ────────────────────────────────────────────────────

    static Header: {
      new(header?: Partial<Packet.Header>): Packet.Header;
      parse(reader: Buffer | Packet.Reader): Packet.Header;
    };

    static Question: {
      new(
        name?: string | Partial<Packet.Question>,
        type?: number,
        cls?: number,
      ): Packet.Question;
      parse(reader: Buffer | Packet.Reader): Packet.Question;
      decode(reader: Buffer | Packet.Reader): Packet.Question;
      encode(question: Packet.Question, writer?: Packet.Writer): Buffer;
    };

    static Resource: {
      new(
        name?: string | Partial<Packet.Resource>,
        type?: number,
        cls?: number,
        ttl?: number,
      ): Packet.Resource;
      parse(reader: Buffer | Packet.Reader): Packet.Resource;
      decode(reader: Buffer | Packet.Reader): Packet.Resource;
      encode(resource: Packet.Resource, writer?: Packet.Writer): Buffer;
      EDNS(rdata: object[]): Packet.Resource;
    };

    static Name: {
      COPY: 0xc0;
      encode(domain: string, writer?: Packet.Writer): Buffer;
      decode(reader: Buffer | Packet.Reader): string;
    };

    static Reader: new(buffer: Buffer, offset?: number) => Packet.Reader;
    static Writer: new() => Packet.Writer;
  }

  namespace Packet {
    interface Header {
      id: number;
      qr: 0 | 1;
      opcode: number;
      aa: 0 | 1;
      tc: 0 | 1;
      rd: 0 | 1;
      ra: 0 | 1;
      z: number;
      rcode: number;
      qdcount: number;
      ancount: number;
      nscount: number;
      arcount: number;
      toBuffer(writer?: Writer): Buffer;
    }

    interface Question {
      name: string;
      type: number;
      class: number;
      toBuffer(writer?: Writer): Buffer;
    }

    /** Union of all possible DNS resource record shapes. */
    interface Resource {
      name: string;
      type: number;
      class: number;
      ttl: number;
      // A / AAAA
      address?: string;
      // MX
      exchange?: string;
      priority?: number;
      // CNAME / PTR / NS
      domain?: string;
      ns?: string;
      // TXT / SPF
      data?: string | string[];
      // SOA
      primary?: string;
      admin?: string;
      serial?: number;
      refresh?: number;
      retry?: number;
      expiration?: number;
      minimum?: number;
      // SRV
      weight?: number;
      port?: number;
      target?: string;
      // CAA
      flags?: number;
      tag?: string;
      value?: string;
      // DNSKEY
      algorithm?: number;
      keyTag?: number;
      publicKey?: string;
      toBuffer(writer?: Writer): Buffer;
    }

    interface Reader {
      offset: number;
      read(bits: number): number;
    }

    interface Writer {
      buffer: number[];
      write(value: number, bits: number): void;
      writeBuffer(writer: Writer): void;
      toBuffer(): Buffer;
    }
  }

  // ── Servers ─────────────────────────────────────────────────────────────────

  class UDPServer extends dgram.Socket {
    constructor(options?: UdpServerOptions | DnsHandler);
    handle(data: Buffer, rinfo: dgram.RemoteInfo): void;
    response(rinfo: dgram.RemoteInfo, message: Packet | Buffer): Promise<Buffer>;
    listen(port?: number, address?: string): Promise<void>;
    on(event: 'request',      listener: DnsHandler): this;
    on(event: 'requestError', listener: (error: Error) => void): this;
    on(event: 'listening',    listener: () => void): this;
    on(event: 'close',        listener: () => void): this;
    on(event: string,         listener: (...args: any[]) => void): this;
  }

  class TCPServer extends net.Server {
    constructor(options?: DnsHandler);
    on(event: 'request',      listener: DnsHandler): this;
    on(event: 'requestError', listener: (error: Error) => void): this;
    on(event: string,         listener: (...args: any[]) => void): this;
  }

  class DOHServer extends EventEmitter {
    constructor(options?: DohServerOptions);
    listen(port?: number, address?: string): void;
    address(): net.AddressInfo | null;
    close(): void;
    on(event: 'request',      listener: DnsHandler): this;
    on(event: 'requestError', listener: (error: Error) => void): this;
    on(event: 'listening',    listener: (address: net.AddressInfo) => void): this;
    on(event: 'close',        listener: () => void): this;
    on(event: string,         listener: (...args: any[]) => void): this;
  }

  class DnsServer extends EventEmitter {
    constructor(options: CreateServerOptions);
    addresses(): ServerAddresses;
    listen(options?: DnsServerListenOptions): Promise<ServerAddresses>;
    close(): Promise<void>;
    on(event: 'request',      listener: DnsHandler): this;
    on(event: 'requestError', listener: (error: Error) => void): this;
    on(event: 'listening',    listener: (addresses: ServerAddresses) => void): this;
    on(event: 'close',        listener: () => void): this;
    on(event: 'error',        listener: (error: Error, transport: 'udp' | 'tcp' | 'doh') => void): this;
    on(event: string,         listener: (...args: any[]) => void): this;
  }

  // ── Handler & resolver callable types ────────────────────────────────────────

  type DnsHandler = (
    request: Packet,
    send: (response: Packet | Buffer) => Promise<Buffer>,
    client: dgram.RemoteInfo | net.Socket | http.IncomingMessage,
  ) => void;

  type DnsResolver = (
    name: string,
    type?: string,
    cls?: number,
    options?: ResolveOptions,
  ) => Promise<Packet>;

  // ── Options ──────────────────────────────────────────────────────────────────

  interface ClientOptions {
    port: number;
    retries: number;
    timeout: number;
    recursive: boolean;
    /** When using UDP and the TC (truncated) bit is set, automatically retry over TCP. Default: `true`. */
    retryOverTCP: boolean;
    resolverProtocol: 'UDP' | 'TCP' | 'DOH' | 'Google';
    /** Shorthand alias for `nameServers`. A single IP string or an array. */
    dns?: string | string[];
    nameServers: string[];
    rootServers: string[];
  }

  interface ResolveOptions {
    recursive?: boolean;
    /** EDNS ECS client subnet in CIDR notation, e.g. `"1.2.3.4/24"` */
    clientIp?: string;
  }

  interface UdpClientOptions {
    dns?: string;
    port?: number;
    socketType?: dgram.SocketType;
    timeout?: number;
    /** When the TC (truncated) bit is set, automatically retry over TCP. Default: `true`. */
    retryOverTCP?: boolean;
  }

  interface TcpClientOptions {
    dns: string;
    protocol?: 'tcp:' | 'tls:';
    port?: number;
  }

  interface DohClientOptions {
    dns: string;
  }

  interface UdpServerOptions {
    type?: 'udp4' | 'udp6';
  }

  interface DohServerOptions {
    port?: number;
    ssl?: boolean;
    cors?: boolean | string | ((origin: string) => boolean);
    [key: string]: any;
  }

  type ListenOptions = number | { port?: number; address?: string };

  interface DnsServerListenOptions {
    udp?: ListenOptions;
    tcp?: ListenOptions;
    doh?: ListenOptions;
  }

  interface CreateServerOptions {
    udp?: boolean | UdpServerOptions;
    tcp?: boolean;
    doh?: boolean | DohServerOptions;
    handle?: DnsHandler;
    maxConcurrent?: number;
  }

  interface ServerAddresses {
    udp?: net.AddressInfo;
    tcp?: net.AddressInfo;
    doh?: net.AddressInfo;
  }
}

export = DNS;
