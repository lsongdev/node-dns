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
    /**
     * One entry per record Packet.parse could not decode; empty for messages
     * built in memory or decoded cleanly.
     */
    errors: Packet.DecodeError[];

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
      RRSIG  : 0x2e;
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

    /**
     * DNS response codes. Codes above 15 are only transmissible in a message
     * carrying an OPT record — their high byte rides in the OPT TTL
     * (RFC 6891 §6.1.3).
     */
    static RCODE: {
      NOERROR   : 0;
      FORMERR   : 1;
      SERVFAIL  : 2;
      NXDOMAIN  : 3;
      NOTIMP    : 4;
      REFUSED   : 5;
      YXDOMAIN  : 6;
      YXRRSET   : 7;
      NXRRSET   : 8;
      NOTAUTH   : 9;
      NOTZONE   : 10;
      DSOTYPENI : 11;
      /** Unsupported EDNS version (RFC 6891); shares code 16 with BADSIG. */
      BADVERS   : 16;
      /** TSIG signature failure (RFC 8945); shares code 16 with BADVERS. */
      BADSIG    : 16;
      BADKEY    : 17;
      BADTIME   : 18;
      BADMODE   : 19;
      BADNAME   : 20;
      BADALG    : 21;
      BADTRUNC  : 22;
      BADCOOKIE : 23;
    };

    static EDNS_OPTION_CODE: {
      ECS: 0x08;
      /** Extended DNS Error (RFC 8914). */
      EDE: 0x0f;
    };

    /**
     * Extended DNS Error INFO-CODEs (RFC 8914 §4). These explain a response;
     * they do not replace its RCODE.
     */
    static EDE: {
      OTHER                          : 0;
      UNSUPPORTED_DNSKEY_ALGORITHM   : 1;
      UNSUPPORTED_DS_DIGEST_TYPE     : 2;
      STALE_ANSWER                   : 3;
      FORGED_ANSWER                  : 4;
      DNSSEC_INDETERMINATE           : 5;
      DNSSEC_BOGUS                   : 6;
      SIGNATURE_EXPIRED              : 7;
      SIGNATURE_NOT_YET_VALID        : 8;
      DNSKEY_MISSING                 : 9;
      RRSIGS_MISSING                 : 10;
      NO_ZONE_KEY_BIT_SET            : 11;
      NSEC_MISSING                   : 12;
      CACHED_ERROR                   : 13;
      NOT_READY                      : 14;
      BLOCKED                        : 15;
      CENSORED                       : 16;
      FILTERED                       : 17;
      PROHIBITED                     : 18;
      STALE_NXDOMAIN_ANSWER          : 19;
      NOT_AUTHORITATIVE              : 20;
      NOT_SUPPORTED                  : 21;
      NO_REACHABLE_AUTHORITY         : 22;
      NETWORK_ERROR                  : 23;
      INVALID_DATA                   : 24;
      SIGNATURE_EXPIRED_BEFORE_VALID : 25;
      TOO_EARLY                      : 26;
      UNSUPPORTED_NSEC3_ITERATIONS   : 27;
      UNABLE_TO_CONFORM_TO_POLICY    : 28;
      SYNTHESIZED                    : 29;
      INVALID_QUERY_TYPE             : 30;
      RATE_LIMITED                   : 31;
      OVER_QUOTA                     : 32;
      NEGATIVE_TRUST_ANCHOR          : 33;
      NEW_DELEGATION_ONLY            : 34;
    };

    /** Octets in a DNS message header. */
    static HEADER_SIZE: 12;

    /** Longest EXTRA-TEXT createErrorResponseFromRequest will emit. */
    static EDE_MAX_TEXT: number;

    /** Reverse of Packet.TYPE, keyed by type code. */
    static TYPE_NAME: Record<number, string>;

    /** Reverse of Packet.EDNS_OPTION_CODE, keyed by option code. */
    static EDNS_OPTION_NAME: Record<number, string>;

    /** Reverse of Packet.EDE, keyed by INFO-CODE. */
    static EDE_NAME: Record<number, string>;

    // ── Static helpers ──────────────────────────────────────────────────────

    /**
     * Decode a DNS message. Throws Packet.DecodeError when the message has no
     * usable header; per-record failures are reported on the returned packet's
     * `errors` array.
     */
    static parse(buffer: Buffer): Packet;
    static typeName(code: number): string;
    static DecodeError: {
      new(message: string, context?: Partial<Packet.DecodeError>): Packet.DecodeError;
      prototype: Packet.DecodeError;
    };
    static createResponseFromRequest(request: Packet): Packet;
    /**
     * Build an error response, optionally explaining why with an RFC 8914
     * Extended DNS Error. The EDE option is attached only when the request
     * carried an OPT record; an OPT is added regardless when `rcode` exceeds 15
     * so its high byte survives serialization.
     */
    static createErrorResponseFromRequest(
      request: Packet,
      rcode: number,
      ede?: { infoCode: number; extraText?: string },
    ): Packet;
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
      EDNS: {
        (
          rdata: object[],
          opts?: {
            extendedRcode?: number;
            version?: number;
            doFlag?: boolean;
            udpPayloadSize?: number;
          },
        ): Packet.Resource;
        /** EDNS Client Subnet, in CIDR notation, e.g. "1.2.3.4/24" (RFC 7871). */
        ECS: {
          (clientIp: string): Packet.EcsOption;
          decode(reader: Packet.Reader, length: number): Packet.EcsOption;
          encode(record: Packet.EcsOption, writer: Packet.Writer): void;
        };
        /** Extended DNS Error (RFC 8914). */
        EDE: {
          (infoCode: number, extraText?: string): Packet.EdeOption;
          decode(reader: Packet.Reader, length: number): Packet.EdeOption;
          encode(record: Packet.EdeOption, writer: Packet.Writer): void;
        };
      };
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
      // TXT / SPF; also the preserved raw RDATA of a type with no encoder
      data?: string | string[] | Buffer;
      // EDNS / OPT — `class` doubles as the requestor's UDP payload size
      rdata?: EdnsOption[];
      extendedRcode?: number;
      version?: number;
      doFlag?: boolean;
      // SOA
      primary?: string;
      admin?: string;
      serial?: number;
      refresh?: number;
      retry?: number;
      /** Seconds for SOA; a YYYYMMDDHHmmSS display string for RRSIG. */
      expiration?: number | string;
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
      protocol?: number;
      zoneKey?: boolean;
      zoneSep?: boolean;
      key?: string;
      // RRSIG (decode only)
      sigType?: number;
      labels?: number;
      originalTtl?: number;
      inception?: string;
      signer?: string;
      signature?: string;
      toBuffer(writer?: Writer): Buffer;
    }

    /** A record, question, or message that could not be decoded. */
    interface DecodeError extends Error {
      /** questions / answers / authorities / additionals */
      section?: string;
      /** Position of the record within its section. */
      index?: number;
      /** Octet offset in the message where the record started. */
      offset?: number;
      /** Whether decoding resumed after this failure. */
      recovered: boolean;
    }

    /** An EDNS option as carried in Packet.Resource['rdata']. */
    interface EdnsOption {
      ednsCode: number;
    }

    /** EDNS Client Subnet option (RFC 7871). */
    interface EcsOption extends EdnsOption {
      family: number;
      sourcePrefixLength: number;
      scopePrefixLength: number;
      ip?: string;
    }

    /** Extended DNS Error option (RFC 8914). */
    interface EdeOption extends EdnsOption {
      /** See Packet.EDE for the registered INFO-CODEs. */
      infoCode: number;
      extraText: string;
    }

    interface Reader {
      buffer: Buffer;
      offset: number;
      read(bits: number): number;
      /** Bits left between the cursor and the end of the message. */
      remaining(): number;
    }

    interface Writer {
      buffer: number[];
      write(value: number, bits: number): void;
      writeBuffer(writer: Writer): void;
      bitLength(): number;
      byteLength(): number;
      patch(bitOffset: number, value: number, bits: number): void;
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
    /** Reserved; not yet honoured by `resolve()`. */
    retries: number;
    /** Per-name-server query timeout in milliseconds. Default: `3000`. */
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
