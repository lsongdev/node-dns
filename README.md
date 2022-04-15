# dns2 

![NPM version](https://img.shields.io/npm/v/dns2.svg?style=flat)
[![Node.js CI](https://github.com/song940/node-dns/actions/workflows/node.js.yml/badge.svg)](https://github.com/song940/node-dns/actions/workflows/node.js.yml)

> A DNS Server and Client Implementation in Pure JavaScript with no dependencies.

### Features

+ Server and Client
+ Lot of Type Supported
+ Extremely lightweight
+ DNS over UDP, TCP, HTTPS Supported

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
  // available options
  // dns: dns server ip address or hostname (string),
  // port: dns server port (number),
  // recursive: Recursion Desired flag (boolean, default true, since > v1.4.2)
};
const dns = new dns2(options);

(async () => {
  const result = await dns.resolveA('google.com');
  console.log(result.answers);
})();
```

Another way to instanciate dns2 UDP Client:

```js
const { UDPClient } = require('dns2');

const resolve = UDPClient();

(async () => {
  const response = await resolve('google.com')
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
    const response = await resolve('lsong.org')
    console.log(response.answers);
  } catch(error) {
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
  dns: '1.1.1.1'
});

(async () => {
  try {
    const result = await resolve('google.com');
    console.log(result.answers);
  } catch(error) {
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
  dns: dns.getServers()[0]
});

(async () => {
  try {
    const result = await resolve('google.com');
    console.log(result.answers);
  } catch(error) {
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
    const [ question ] = request.questions;
    const { name } = question;
    response.answers.push({
      name,
      type: Packet.TYPE.A,
      class: Packet.CLASS.IN,
      ttl: 300,
      address: '8.8.8.8'
    });
    send(response);
  }
});

server.on('request', (request, response, rinfo) => {
  console.log(request.header.id, request.questions[0]);
});

server.on('requestError', (error) => {
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
    address: "127.0.0.1",
    type: "udp4",  // IPv4 or IPv6 (Must be either "udp4" or "udp6")
  },
  
  // Optionally specify port and/or address for tcp server:
  tcp: { 
    port: 5333,
    address: "127.0.0.1",
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

### Relevant Specifications

+ [RFC-1034 - Domain Names - Concepts and Facilities](https://tools.ietf.org/html/rfc1034)
+ [RFC-1035 - Domain Names - Implementation and Specification](https://tools.ietf.org/html/rfc1035)
+ [RFC-2782 - A DNS RR for specifying the location of services (DNS SRV)](https://tools.ietf.org/html/rfc2782)
+ [RFC-7766 - DNS Transport over TCP - Implementation Requirements](https://tools.ietf.org/html/rfc7766)
+ [RFC-8484 - DNS Queries over HTTPS (DoH)](https://tools.ietf.org/html/rfc8484)

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
