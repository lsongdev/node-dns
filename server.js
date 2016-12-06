const tcp          = require('net');
const util         = require('util');
const dgram        = require('dgram');
const EventEmitter = require('events');
const Packet       = require('./packet');
/**
 * [Server description]
 * @docs https://tools.ietf.org/html/rfc1034
 * @docs https://tools.ietf.org/html/rfc1035
 */
function Server(){
  var self = this;
  this.type = 'udp';
  this.socket = this.createServer();
};

util.inherits(Server, EventEmitter);

Server.prototype.createServer = function(){
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

Server.prototype.parse = function(buffer, rinfo){
  var request = Packet.parse(buffer);
  request.remote = rinfo;
  this.emit('request', request);
};

Server.prototype.send = function(response){
  console.log(response);
  response.header.qr = 1;
  var rinfo = response.remote;
  var buf = response.toBuffer();
  this.socket.send(buf, 0, buf.length, rinfo.port, rinfo.address);
};

/**
 * [listen description]
 * @param  {[type]}   port     [description]
 * @param  {Function} callback [description]
 * @return {[type]}            [description]
 */
Server.prototype.listen = function(port, callback){
  switch(this.type){
    case 'udp':
      this.socket.bind(port, callback);
      break;
    case 'tcp':
      this.socket.listen(port, callback);
      break;
  }
};

module.exports = Server;
