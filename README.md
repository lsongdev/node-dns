# dns2

![NPM version][npm-img] [![Build Status][ci-img]][ci-url]

> A DNS Server and Client Implementation in Pure JavaScript with no dependencies.

### Features

- Server and Client
- Lot of Type Supported
- Extremely lightweight
- DNS over UDP, TCP, HTTPS Supported

### Installation

```bash
$ npm install dns2
```

### DNS Client (default UDP)

Lookup any records available for the domain `lsong.org`.
DNS client will use UDP by default.

```js
const dns2 = require('dns2');

const options = {
  // nameServers: ['8.8.8.8']  — array of DNS server IPs (default: Google + 114dns)
  // port: 53                  — DNS server port (number)
  // recursive: true           — Recursion Desired flag (boolean, default true)
  // timeout: 3000             — per-name-server timeout in milliseconds
};
const dns = new dns2(options);

(async () => {
  const result = await dns.resolveA('google.com');
  console.log(result.answers);
})();
```

The high-level `DNS` class exposes convenience methods for common record types:

| Method                  | Record type | Key answer fields                                                         |
| ----------------------- | ----------- | ------------------------------------------------------------------------- |
| `resolveA(domain)`      | A           | `address`                                                                 |
| `resolveAAAA(domain)`   | AAAA        | `address`                                                                 |
| `resolveMX(domain)`     | MX          | `exchange`, `priority`                                                    |
| `resolveCNAME(domain)`  | CNAME       | `domain`                                                                  |
| `resolveSOA(domain)`    | SOA         | `primary`, `admin`, `serial`, `refresh`, `retry`, `expiration`, `minimum` |
| `resolvePTR(domain)`    | PTR         | `domain`                                                                  |
| `resolveDNSKEY(domain)` | DNSKEY      | `publicKey`, `algorithm`                                                  |
| `resolveRRSIG(domain)`  | RRSIG       | varies                                                                    |

For any record type not listed above, use `dns.resolve(domain, 'TYPE')` directly.

Every name server is queried in parallel and the first successful reply wins. If
all of them fail, the rejection names each server and its reason.

### When a packet fails to decode

`Packet.parse` throws a `Packet.DecodeError` when a message cannot be decoded at
all — it is shorter than a 12-octet header, or not a Buffer:

```js
try {
  Packet.parse(buffer);
} catch (err) {
  // "message is 7 octets, too short for the 12-octet header (RFC 1035 §4.1.1)"
  console.error(err.message);
}
```

Once the header decodes, a malformed _record_ no longer disappears silently.
Records that cannot be decoded are dropped — a half-populated record would be
worse than none — and the reason is reported on `packet.errors`:

```js
const packet = Packet.parse(buffer);

for (const err of packet.errors) {
  console.error(err.message);
  // "answers[0] at offset 12: TXT decode: character-string of 10 octets
  //  overruns RDATA (4 octets remaining)"
  err.section; // 'questions' | 'answers' | 'authorities' | 'additionals'
  err.index; // position within that section
  err.offset; // octet offset in the message where the record started
  err.recovered; // see below
}
```

`packet.errors` is empty for a clean parse, so `packet.errors.length` is the test
for "did anything go wrong". Comparing a section's length against its header
count (`packet.answers.length` vs `packet.header.ancount`) shows how much of the
message survived.

`err.recovered` distinguishes the two kinds of failure:

- `true` — the damage was confined to one record's RDATA. RDLENGTH says where
  the next record begins, so decoding continued and later records are intact.
- `false` — the failure left the reader misaligned (a truncated message, or a
  name that ran off the end). Nothing after that point can be located, so
  decoding stopped there instead of emitting junk records.

Servers surface the same information. A query that cannot be decoded at all
raises `requestError`; one that partially decodes reaches the handler with
`request.errors` populated, which is enough to answer `FORMERR` if you prefer:

```js
dns2
  .createServer({
    udp: true,
    handle: (request, send) => {
      if (request.errors.length) {
        const response = Packet.createResponseFromRequest(request);
        response.header.rcode = Packet.RCODE.FORMERR;
        return send(response);
      }
      // ...
    },
  })
  .on('requestError', err => console.error('undecodable query:', err.message));
```

#### Telling the client why: Extended DNS Errors

`FORMERR` says "malformed" in four bits and nothing more. RFC 8914 Extended DNS
Errors add an EDNS option carrying an INFO-CODE plus free-form text, which is
where a decode reason belongs. `Packet.EDE.INVALID_DATA` (24) is the code for
data that could not be interpreted.

`Packet.createErrorResponseFromRequest` composes the whole reply:

```js
const server = dns2.createServer({
  udp: true,
  handle: (request, send) => {
    if (request.errors.length) {
      return send(
        Packet.createErrorResponseFromRequest(request, Packet.RCODE.FORMERR, {
          infoCode: Packet.EDE.INVALID_DATA,
          extraText: request.errors.map(e => e.message).join('; '),
        }),
      );
    }
    // ... normal handling
  },
});
```

A client reads it back off any response:

```js
const response = await resolve('example.com');
const opt = response.additionals.find(r => r.type === Packet.TYPE.EDNS);
for (const option of opt?.rdata ?? []) {
  if (option.ednsCode !== Packet.EDNS_OPTION_CODE.EDE) continue;
  console.error(
    `${Packet.EDE_NAME[option.infoCode] ?? option.infoCode}: ${option.extraText}`,
  );
  // "INVALID_DATA: answers[0] at offset 12: TXT decode: character-string ..."
}
```

Extended errors are additive — they annotate a response without changing its
RCODE, and appear on `NOERROR` responses too. Three details the builder handles:

- The option is attached **only when the request carried an OPT record**
  (RFC 8914 §3), since a client that didn't signal EDNS cannot be sent EDNS
  options. A request too malformed to have a readable OPT gets a bare RCODE.
- An OPT is added regardless when the RCODE exceeds 15, so its high byte
  survives serialization — otherwise `BADVERS` would go out as `NOERROR`.
- `extraText` is truncated to `Packet.EDE_MAX_TEXT` (256), because the reply
  still has to fit the negotiated UDP payload size.

`Packet.EDE` holds the full registry of INFO-CODEs and `Packet.EDE_NAME` maps a
received code back to its name.

#### Example: SOA record lookup

SOA (Start of Authority) records contain the authoritative zone information for a domain.
If the authoritative nameserver returns the SOA record in the answer section, it will appear
in `result.answers`. Otherwise check `result.authorities`.

```js
const dns2 = require('dns2');

const dns = new dns2({ nameServers: ['8.8.8.8'] });

(async () => {
  const result = await dns.resolveSOA('google.com');
  const soa = result.answers[0] || result.authorities[0];
  if (soa) {
    console.log(soa.primary); // ns1.google.com
    console.log(soa.admin); // dns-admin.google.com
    console.log(soa.serial); // zone serial number
    console.log(soa.refresh); // refresh interval (seconds)
    console.log(soa.retry); // retry interval (seconds)
    console.log(soa.expiration); // expiry (seconds)
    console.log(soa.minimum); // minimum TTL (seconds)
  }
})();
```

Another way to instanciate dns2 UDP Client:

```js
const { UDPClient } = require('dns2');

const resolve = UDPClient();

(async () => {
  const response = await resolve('google.com');
  console.log(response.answers);
})();
```

### DNS Client (TCP)

Lookup any records available for the domain `lsong.org`. By default, DNS requests will use UDP.

```js
const { TCPClient } = require('dns2');

const resolve = TCPClient();

(async () => {
  try {
    const response = await resolve('lsong.org');
    console.log(response.answers);
  } catch (error) {
    // some DNS servers (i.e cloudflare 1.1.1.1, 1.0.0.1)
    // may send an empty response when using TCP
    console.log(error);
  }
})();
```

### Client Custom DNS Server

You can pass your own DNS Server.

```js
const { TCPClient } = require('dns2');

const resolve = TCPClient({
  dns: '1.1.1.1',
});

(async () => {
  try {
    const result = await resolve('google.com');
    console.log(result.answers);
  } catch (error) {
    console.log(error);
  }
})();
```

### System DNS Server

You can use the first DNS server from your OS with native node dns.

```js
const dns = require('dns');
const { TCPClient } = require('dns2');

const resolve = TCPClient({
  dns: dns.getServers()[0],
});

(async () => {
  try {
    const result = await resolve('google.com');
    console.log(result.answers);
  } catch (error) {
    console.log(error);
  }
})();
```

### Example Server

```js
const dns2 = require('dns2');

const { Packet } = dns2;

const server = dns2.createServer({
  udp: true,
  handle: (request, send, rinfo) => {
    const response = Packet.createResponseFromRequest(request);
    const [question] = request.questions;
    const { name } = question;
    response.answers.push({
      name,
      type: Packet.TYPE.A,
      class: Packet.CLASS.IN,
      ttl: 300,
      address: '8.8.8.8',
    });
    send(response);
  },
});

server.on('request', (request, response, rinfo) => {
  console.log(request.header.id, request.questions[0]);
});

server.on('requestError', error => {
  console.log('Client sent an invalid request', error);
});

server.on('listening', () => {
  console.log(server.addresses());
});

server.on('close', () => {
  console.log('server closed');
});

server.listen({
  // Optionally specify port, address and/or the family of socket() for udp server:
  udp: {
    port: 5333,
    address: '127.0.0.1',
  },

  // Optionally specify port and/or address for tcp server:
  tcp: {
    port: 5333,
    address: '127.0.0.1',
  },
});

// eventually
server.close();
```

Then you can test your DNS server:

```bash
$ dig @127.0.0.1 -p5333 lsong.org
```

Note that when implementing your own lookups, the contents of the query
will be found in `request.questions[0].name`.

### Responding with DNS Error Codes

Use `Packet.RCODE` to send standard DNS error responses from your handler:

| Constant                 | Value | Meaning                            |
| ------------------------ | ----- | ---------------------------------- |
| `Packet.RCODE.NOERROR`   | 0     | No error                           |
| `Packet.RCODE.FORMERR`   | 1     | Format error                       |
| `Packet.RCODE.SERVFAIL`  | 2     | Server failure                     |
| `Packet.RCODE.NXDOMAIN`  | 3     | Non-existent domain                |
| `Packet.RCODE.NOTIMP`    | 4     | Not implemented                    |
| `Packet.RCODE.REFUSED`   | 5     | Query refused                      |
| `Packet.RCODE.YXDOMAIN`  | 6     | Name exists when it should not     |
| `Packet.RCODE.YXRRSET`   | 7     | RRset exists when it should not    |
| `Packet.RCODE.NXRRSET`   | 8     | RRset that should exist does not   |
| `Packet.RCODE.NOTAUTH`   | 9     | Not authoritative / not authorized |
| `Packet.RCODE.NOTZONE`   | 10    | Name not contained in zone         |
| `Packet.RCODE.DSOTYPENI` | 11    | DSO-TYPE not implemented           |
| `Packet.RCODE.BADVERS`   | 16    | Bad OPT version                    |
| `Packet.RCODE.BADSIG`    | 16    | TSIG signature failure             |
| `Packet.RCODE.BADKEY`    | 17    | Key not recognized                 |
| `Packet.RCODE.BADTIME`   | 18    | Signature out of time window       |
| `Packet.RCODE.BADMODE`   | 19    | Bad TKEY mode                      |
| `Packet.RCODE.BADNAME`   | 20    | Duplicate key name                 |
| `Packet.RCODE.BADALG`    | 21    | Algorithm not supported            |
| `Packet.RCODE.BADTRUNC`  | 22    | Bad truncation                     |
| `Packet.RCODE.BADCOOKIE` | 23    | Bad or missing server cookie       |

Codes above 15 do not fit the header's 4-bit RCODE field — their high byte
travels in an OPT record's TTL (RFC 6891 §6.1.3), so a response using one must
carry an OPT. `Packet.createErrorResponseFromRequest` attaches one for you.
Note that 16 has two names in the IANA registry: they share the code point on
the wire, and only context distinguishes them.

```js
const dns2 = require('dns2');
const { Packet } = dns2;

const server = dns2.createServer({
  udp: true,
  handle: (request, send) => {
    const response = Packet.createResponseFromRequest(request);
    const [question] = request.questions;

    if (question.name.endsWith('.internal')) {
      // Refuse queries for internal names
      response.header.rcode = Packet.RCODE.REFUSED;
      return send(response);
    }

    if (!isKnownDomain(question.name)) {
      // Domain does not exist
      response.header.rcode = Packet.RCODE.NXDOMAIN;
      return send(response);
    }

    // Normal answer ...
    response.answers.push({
      name: question.name,
      type: Packet.TYPE.A,
      class: Packet.CLASS.IN,
      ttl: 300,
      address: '1.2.3.4',
    });
    send(response);
  },
});
```

### Performance and Benchmarking

see [benchmark/README.md](benchmark/README.md)

### Relevant Specifications

- [RFC-1034 - Domain Names - Concepts and Facilities](https://tools.ietf.org/html/rfc1034)
- [RFC-1035 - Domain Names - Implementation and Specification](https://tools.ietf.org/html/rfc1035)
- [RFC-2782 - A DNS RR for specifying the location of services (DNS SRV)](https://tools.ietf.org/html/rfc2782)
- [RFC-7766 - DNS Transport over TCP - Implementation Requirements](https://tools.ietf.org/html/rfc7766)
- [RFC-8484 - DNS Queries over HTTPS (DoH)](https://tools.ietf.org/html/rfc8484)

### Contributing

- Fork this Repo first
- Clone your Repo
- Install dependencies by `$ npm install`
- Checkout a feature branch
- Feel free to add your features
- Make sure your features are fully tested
- Publish your local branch, Open a pull request
- Enjoy hacking <3

### MIT license

Copyright (c) 2016 LIU SONG <song940@gmail.com> & [contributors](https://github.com/song940/node-dns/graphs/contributors).

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS," WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

[npm-img]: https://img.shields.io/npm/v/dns2.svg?style=flat
[ci-img]: https://github.com/song940/node-dns/actions/workflows/node.js.yml/badge.svg
[ci-url]: https://github.com/song940/node-dns/actions/workflows/node.js.yml
