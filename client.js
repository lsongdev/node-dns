const dgram  = require('dgram');
const Packet = require('./packet');
/**
 * [DNSClient description]
 * @docs https://tools.ietf.org/html/rfc1034
 * @docs https://tools.ietf.org/html/rfc1035
 */
function DNSClient(){
  this.socket = dgram.createSocket('udp4');
  this.socket.on('message', function(message){
    var response = Packet.parse(message);
    console.log(response, message);
  });
}

/**
 * [send description]
 * @param  {[type]} request [description]
 * @return {[type]}         [description]
 */
DNSClient.prototype.send = function(request){
  if(!(request instanceof Packet))
    request = new Packet(request);

  this.socket.send(request.toBuffer(), 53, '8.8.8.8');
  
};

/**
 * [lookup description]
 * @type {[type]}
 */
DNSClient.prototype.lookup =
DNSClient.prototype.query = function(name, callback){
  var request = new Packet();
  return this.send(request);
};

module.exports = DNSClient;
