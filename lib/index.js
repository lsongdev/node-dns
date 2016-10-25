
/**
 * [DNSClient description]
 * @docs https://tools.ietf.org/html/rfc1034
 * @docs https://tools.ietf.org/html/rfc1035
 */
function DNSClient(){
  
}

/**
 * [send description]
 * @param  {[type]} request [description]
 * @return {[type]}         [description]
 */
DNSClient.prototype.send = function(request){
  if(!(request instanceof Request))
    request = new Request(request);
    
  //
  console.log(request);
  
};

/**
 * [lookup description]
 * @type {[type]}
 */
DNSClient.prototype.lookup =
DNSClient.prototype.query = function(name, callback){
  var request = new Request();
  return this.send(request);
};

module.exports = DNSClient;
