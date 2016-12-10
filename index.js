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
  this.events = {};
  this.options = defaults;
  this.socket = udp.createSocket('udp4');
  this.socket.on('message', function(message){
    var err, response;
    try{
      response = Packet.parse(message);
      console.log(response);
    }catch(e){
      err = e;
    }
    if(response.header.id in self.events){
      self.events[ response.header.id ](err, response);
    }
    this.close();
  });
}

/**
 * [send description]
 * @param  {[type]} request [description]
 * @return {[type]}         [description]
 */
DNS.prototype.lookup = function(request, callback){
  if(!(request instanceof Packet)){
    request = new Packet(new Packet.Question(request));
  }
  request.header.id = Packet.uuid();
  this.events[ request.header.id ] = callback;
  this.socket.send(request.toBuffer(), this.options.port, this.options.servers);
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

