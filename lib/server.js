const util         = require('util');
const dgram        = require('dgram');
const EventEmitter = require('events');
const Request      = require('./request');
const Response     = require('./response');
/**
 * [DNSServer description]
 * @docs https://tools.ietf.org/html/rfc1034
 * @docs https://tools.ietf.org/html/rfc1035
 */
function DNSServer(){
  var self = this;
  this.udp = dgram.createSocket('udp4');
  this.udp.on('message', function(data){
    self.emit('request', new Request(data));
  });
};

util.inherits(DNSServer, EventEmitter);

DNSServer.prototype.send = function(response){
  console.log(response);
};

/**
 * [listen description]
 * @param  {[type]}   port     [description]
 * @param  {Function} callback [description]
 * @return {[type]}            [description]
 */
DNSServer.prototype.listen = function(port, callback){
  this.udp.bind(port, callback);
};

module.exports = DNSServer;
