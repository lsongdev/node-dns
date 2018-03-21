const udp    = require('dgram');
const Packet = require('./packet');
/**
 * [DNS description]
 * @docs https://tools.ietf.org/html/rfc1034
 * @docs https://tools.ietf.org/html/rfc1035
 */
function DNS(options){
  Object.assign(this, {
    port: 53,
    retries: 3,
    timeout: 3,
    nameServers: [
      '8.8.8.8',
      '8.8.4.4',
      '114.114.114.114'
    ],
    rootServers: [
      'a.root-servers.net',
      'b.root-servers.net',
      'c.root-servers.net',
      'd.root-servers.net',
      'e.root-servers.net',
      'f.root-servers.net',
      'g.root-servers.net',
      'h.root-servers.net',
      'i.root-servers.net',
      'j.root-servers.net',
      'k.root-servers.net',
      'l.root-servers.net',
      'm.root-servers.net'
    ]
  }, options);
  var self = this;
  this.requests = [];
  this.servers = this.options.servers.map(function(ns){
    return { server: ns, port: this.options.port, priority: 10 };
  }.bind(this));
  this.socket = udp.createSocket('udp4');
  this.socket.on('message', function(message, rinfo){
    var response = Packet.parse(message);
    self.requests.forEach(function(request){
      if(response.header.id === request.header.id){
        clearInterval(request.timer);
        request.done(null, response);
        self.socket.close();
      }else{
        console.warn('response id mismatch %s, %s', 
          request.header.id, response.header.id);
      }
    });
  });
  return this;
}

DNS.prototype.query = (domain, nameservers, done) => {
  console.log(domain, nameservers);
};

DNS.prototype.resolve = function(domain){
  const parts = domain.split('.');
  (function resolve(ns){
    this.query(parts.pop(), ns, resolve);
  }.bind(this))(this.rootServers);
};

/**
 * [send description]
 * @param  {[type]} request [description]
 * @return {[type]}         [description]
 */
DNS.prototype.send = function(request, callback){
  var self = this;
  request.times = 0;
  request.done = callback;
  request.socket = this.socket;
  request.send = function(){
    this.requestTime = new Date;
    this.header.rd = 1;
    this.header.id = DNS.Packet.uuid();
    this.server = self.servers.sort(function(a, b){
      return a.priority - b.priority;
    })[0];
    var buffer = this.toBuffer();
    this.socket.send(buffer, 0, buffer.length,
    this.server.port,
    this.server.server, function(err, len){
      console.log('packet sent %s bytes to %s', len, request.server.server);
    });
    return this;
  };
  request.timer = setInterval(function(){
    if(request.times < self.options.retries){
      self.servers = self.servers.map(function(a){
        if(request.server.server === a.server){
          a.priority++;
        }
        return a;
      });
      request.send();
      request.times++;
    }else{
      clearInterval(request.timer);
      request.done(new Error('timeout'));
    }
  }, this.options.timeout * 1e3);
  this.requests.push(request.send());
  return this;
};

/**
 * [Server description]
 * @type {[type]}
 */
DNS.Packet = Packet;
DNS.Server = require('./server');
DNS.createServer = function(options){
  return new DNS.Server(options);
};

module.exports = DNS;

