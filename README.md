## dns2 

![NPM version](https://img.shields.io/npm/v/dns2.svg?style=flat)
[![Build Status](https://travis-ci.org/song940/node-dns.svg?branch=master)](https://travis-ci.org/song940/node-dns)

> A dns server and client implementation

### Installation

```bash
$ npm i dns2
```

### Example

```js
const DNS = require('dns2');

var dns = new DNS();

var packet = new DNS.Packet();

packet.questions.push({
  name : 'lsong.org',
  type : DNS.Packet.TYPE.ANY,
  class: DNS.Packet.CLASS.IN
});

dns.send(packet, function(err, res){
  console.log(err, res);
});

```

server

```js
const dns = require('dns2');

var server = dns.createServer(function(request){
  
  var response = new dns.Packet(request);
  
  response.question.push({
    address: '8.8.8.8'
  });
  
  this.send(response);

}).listen(5353);

// dig @127.0.0.1 -p5353 lsong.org

```

### API

- dns2.Packet()
- dns2.Client()
- dns2.Server()
- dns2.createServer()
- dns2.lookup()

### SPEC

+ rfc1034 https://tools.ietf.org/html/rfc1034
+ rfc1035 https://tools.ietf.org/html/rfc1035
+ rfc2782 https://tools.ietf.org/html/rfc2782

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
of this software and associated documentation files (the &quot;Software&quot;), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED &quot;AS IS&quot;, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

---