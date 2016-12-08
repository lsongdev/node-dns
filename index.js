const udp    = require('dgram');
const Packet = require('./packet');
/**
 * [DNS description]
 * @docs https://tools.ietf.org/html/rfc1034
 * @docs https://tools.ietf.org/html/rfc1035
 */
function DNS(options){
  var self = this;
  var defaults = {
    port: 53,
    servers: '8.8.8.8'
  };
  for(var k in options){
    defaults[ k ] = options[k];
  }
  this.map = {};
  this.options = defaults;
  this.socket = udp.createSocket('udp4');
  this.socket.on('message', function(message){
    var response = Packet.parse(message);
    self.map[ response.id ](null, response);
    this.close();
  });
}

/**
 * [send description]
 * @param  {[type]} request [description]
 * @return {[type]}         [description]
 */
DNS.prototype.lookup = function(domain, callback){
  var request = new Packet({
    id: Math.floor(Math.random() * 1e5)
  });
  this.map[ request.id ] = callback;
  request.questions.push({
    name: domain,
    type: Packet.TYPE.ANY
  });
  this.socket.send(request.toBuffer(), this.options.port, this.options.servers);
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

