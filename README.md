# dns2 

![NPM version](https://img.shields.io/npm/v/dns2.svg?style=flat)
[![Build Status](https://travis-ci.org/song940/node-dns.svg?branch=master)](https://travis-ci.org/song940/node-dns)

> A DNS server and client implementation

### Installation

```bash
$ npm install dns2
```

### Example Client

Lookup any records available for the domain `lsong.org`.

```js
const DNS = require('dns2');

const dns = new DNS();

(async () => {
  const result = await dns.resolveA('google.com');
  console.log(result.answers);
})();
```

### Example Server

Respond to any DNS request on UDP port 5353 with `8.8.8.8`, a Google Public DNS server address.

```js
const dns = require('dns2');

const { Packet } = dns;

const server = dns.createServer(function(request, send) {
  const response = Packet.createResponseFromRequest(request);
  const answer = new Packet.createResourceFromQuestion(request.questions[0], {
    target: 'hermes2.jabber.org',
    port: 8080,
    weight: 30,
    priority: 30
  });
  response.answers.push(answer);
  send(response);
}).listen(5333);
```

Then you can test your DNS server:

```bash
$ dig @127.0.0.1 -p5353 lsong.org
```

Note that when implementing your own lookups, the contents of the query
will be found in `request.questions[0].name`.

### API

- dns2.createServer()
- dns2.lookup()
- dns2.Packet()
- dns2.Client()
- dns2.Server()

### Relevant Specifications

+ [RFC-1034 - Domain Names - Concepts and Facilities](https://tools.ietf.org/html/rfc1034)
+ [RFC-1035 - Domain Names - Implementation and Specification](https://tools.ietf.org/html/rfc1035)
+ [RFC-2782 - A DNS RR for specifying the location of services (DNS SRV)](https://tools.ietf.org/html/rfc2782)

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

Copyright (c) 2016 lsong

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
