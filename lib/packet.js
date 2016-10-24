/**
 * [Packet description]
 * @param {[type]} data [description]
 * @docs https://tools.ietf.org/html/rfc1034
 * @docs https://tools.ietf.org/html/rfc1035
 *
 * <Buffer 29 64 01 00 00 01 00 00 00 00 00 00 03 77 77 77 01 7a 02 63 6e 00 00 01 00 01>
 *        |-ID----------- HEADER ----------->| |<-W--W--W-----Z-----C--N>|<------------>|
 */
function Packet(){
  this.header = {
    id: 0,
    qr: 0,
    opcode: 0,
    aa: 0,
    tc: 0,
    rd: 1,
    ra: 0,
    z: 0,
    rcode: 0
  };
  this.question = [];
  this.answer = [];
  this.authority = [];
  this.additional = [];
  return this;
};

Packet.parse = function(buffer){
  var packet = new Packet();
  return packet;
};

// /**
//  * [parseDomainName description]
//  * @param  {[type]} str [description]
//  * @return {[type]}     [description]
//  */
// Packet.prototype.parseDomainName = function(str){
//   str = str || '';
//   var len = this.read();
//   if(len == 0) return str;
//   while(len--)
//     str += String.fromCharCode(this.read());
//   return this.parseDomainName(str + '.');
// }

// Packet.prototype.serializeDomainName = function(name){
//   return name.split('.').map(function(part){
//     return [].concat.apply([], [ part.length,
//       part.split('').map(function(c){
//         return c.charCodeAt(0);
//       })
//     ]);
//   }).reduce(function(a, b){
//     return a.concat(b);
//   });
// };

// Packet.prototype.read = function(offset, size){
  
// };

// Packet.prototype.write = function(d, size) {
  
// };

module.exports = Packet;
