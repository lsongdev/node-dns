const tcp          = require('net');
const util         = require('util');
const udp          = require('dgram');
const EventEmitter = require('events');
const Packet       = require('./packet');
/**
 * [Server description]
 * @docs https://tools.ietf.org/html/rfc1034
 * @docs https://tools.ietf.org/html/rfc1035
 */
function Server(options, callback){
  if(typeof options === 'function'){
    callback = options;
    options = {};
    this.on('request', callback);
  }
  this.socket = udp.createSocket('udp4');
  this.socket.on('message', this.parse.bind(this));
};

util.inherits(Server, EventEmitter);

Server.prototype.parse = function(buffer, rinfo){
  var request = Packet.parse(buffer);
  this.emit('request', request, this.send.bind(this, rinfo));
};

Server.prototype.send = function(rinfo, response){
  this.socket.send(response.toBuffer(), rinfo.port, rinfo.address);
};

/**
 * [listen description]
 * @param  {[type]}   port     [description]
 * @param  {Function} callback [description]
 * @return {[type]}            [description]
 */
Server.prototype.listen = function(port, callback){
  this.socket.bind(port, callback);
};

module.exports = Server;
