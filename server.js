const tcp          = require('net');
const util         = require('util');
const dgram        = require('dgram');
const EventEmitter = require('events');
const Packet       = require('./packet');
/**
 * [DNSServer description]
 * @docs https://tools.ietf.org/html/rfc1034
 * @docs https://tools.ietf.org/html/rfc1035
 */
function DNSServer(){
  var self = this;
  this.type = 'udp';
  this.socket = this.createServer();
};

util.inherits(DNSServer, EventEmitter);

DNSServer.prototype.createServer = function(){
  var self = this;
  switch(this.type){
    case 'udp':
      this.socket = dgram.createSocket('udp4');
      this.socket.on('message', this.parse.bind(this));
      break;
    case 'tcp':
      this.socket = tcp.createServer(function(client){
        client
        .on('error', console.error)
        .on('data', self.parse.bind(this));
      });
      break;
  }
  return this.socket;
};


DNSServer.prototype.parse = function(buffer, remote){
  var request = Packet.parse(buffer);
  request.remote = remote;
  this.emit('request', request);
};

DNSServer.prototype.send = function(response){
  console.log(response);
  var remote = response.remote;
  this.socket.send(response.toBuffer(), remote.port, remote.address);
};

/**
 * [listen description]
 * @param  {[type]}   port     [description]
 * @param  {Function} callback [description]
 * @return {[type]}            [description]
 */
DNSServer.prototype.listen = function(port, callback){
  switch(this.type){
    case 'udp':
      this.socket.bind(port, callback);
      break;
    case 'tcp':
      this.socket.listen(port, callback);
      break;
  }
};

module.exports = DNSServer;
