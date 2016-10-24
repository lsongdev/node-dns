function BufferReader(buf){
  this.buffer = buf;
};
/**
 * [read description]
 * @param  {[type]} offset [description]
 * @param  {[type]} length [description]
 * @return {[type]}        [description]
 */
BufferReader.prototype.read = function(offset, length){
  var val = this.buffer.readUInt16BE(Math.ceil(offset/16));
  console.log(val & 0xffff >> 0);
};

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

/**
 * [parse description]
 * @param  {[type]} buffer [description]
 * @return {[type]}        [description]
 */
Packet.parse = function(buffer){
  var packet = new Packet();
  var reader = new BufferReader(buffer);
  packet.header.id     = reader.read(17, 1);
  // packet.header.qr     = reader.read(17, 1);
  // packet.header.opcode = reader.read(18, 4);
  // packet.header.aa     = reader.read(22, 1);
  // packet.header.tc     = reader.read(23, 1);
  // packet.header.rd     = reader.read(24, 1);
  // packet.header.ra     = reader.read(25, 1);
  // packet.header.z      = reader.read(26, 3);
  // packet.header.rcode  = reader.read(29, 4);

  // var question         = reader.read(33, 16);
  // var answer           = reader.read(49, 16);
  // var authority        = reader.read(65, 16);
  // var additional       = reader.read(81, 16);
  // console.log(question);
  return packet;
};

/**
 * [parseDomainName description]
 * @param  {[type]} str [description]
 * @return {[type]}     [description]
 */
Packet.parseDomainName = function(str){
  str = str || '';
  var len = this.read();
  if(len == 0) return str;
  while(len--)
    str += String.fromCharCode(this.read());
  return this.parseDomainName(str + '.');
}

Packet.serializeDomainName = function(name){
  return name.split('.').map(function(part){
    return [].concat.apply([], [ part.length,
      part.split('').map(function(c){
        return c.charCodeAt(0);
      })
    ]);
  }).reduce(function(a, b){
    return a.concat(b);
  });
};


module.exports = Packet;
