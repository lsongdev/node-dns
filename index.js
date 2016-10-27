const udp    = require('dgram');
const Packet = require('./packet');
const _      = require('./consts');
/**
 * [DNS description]
 * @docs https://tools.ietf.org/html/rfc1034
 * @docs https://tools.ietf.org/html/rfc1035
 */
function DNS(){
  var self = this;
  this.socket = udp.createSocket('udp4');
  this.socket.on('message', function(message){
    var response = Packet.parse(message);
    console.log(response);
    this.close();
  });
}

/**
 * [send description]
 * @param  {[type]} request [description]
 * @return {[type]}         [description]
 */
DNS.prototype.send = function(request){
  if(!(request instanceof Packet))
    request = new Packet(request);
  request.header.id = Math.floor(Math.random() * 1e5);
  request.header.rd = 1;
  var buffer = request.toBuffer();
  // this.socket.send(buffer, 53, '114.114.114.114');
  // this.socket.send(buffer, 53, '8.8.8.8');
  this.socket.send(buffer, 53, 'a.root-servers.net');
  
};

/**
 * [lookup description]
 * @type {[type]}
 */
DNS.prototype.lookup =
DNS.prototype.query = function(question, callback){
  var request = new Packet();
  if(typeof question === 'string'){    
    question = {
      name : question,
      type : _.QUERY_TYPE.ANY,
      class: _.QUERY_CLASS.IN
    };
  }
  if(question instanceof Packet){
    request = question;
  }else if(typeof question == 'object'){
    request.question.push(question);
  }
  return this.send(request);
};

/**
 * [Server description]
 * @type {[type]}
 */
DNS.Server = require('./server');
DNS.createServer = function(options){
  return new DNS.Server(options);
};

module.exports = DNS;

