function BufferReader(buf){
  this.offset = 0;
  this.buffer = buf;
};
/**
 * [read description]
 * @param  {[type]} offset [description]
 * @param  {[type]} length [description]
 * @return {[type]}        [description]
 */
BufferReader.prototype.read = function(length, offset){
  length = length || 1;
  offset = this.offset = offset || this.offset;
  var mask = '', hi = length, mode = offset % 16;
  var lo = 16 - (mode + hi);
  while(hi--) mask += 1;
  while(lo--) mask += 0;
  var val = this.buffer.readUInt16BE(Math.floor(offset/16) * 2);
  val = (val & parseInt(mask, 2)) >> (16 - (mode + length));
  this.offset += length;
  return val;
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
  packet.header.id     = reader.read(16);
  packet.header.qr     = reader.read(1);
  packet.header.opcode = reader.read(4);
  packet.header.aa     = reader.read(1);
  packet.header.tc     = reader.read(1);
  packet.header.rd     = reader.read(1);
  packet.header.ra     = reader.read(1);
  packet.header.z      = reader.read(3);
  packet.header.rcode  = reader.read(4);

  var question         = reader.read(16);
  var answer           = reader.read(16);
  var authority        = reader.read(16);
  var additional       = reader.read(16);
  
  console.log('offset', reader.offset);
  
  function parseDomainName(str){
    str = str || '';
    var len = reader.read(8);
    if(len == 0) return str;
    while(len--) 
      str += String.fromCharCode(reader.read(8));
    return parseDomainName(str + '.');
  }
  
  packet.question.push({
    name : parseDomainName(),
    type : reader.read(16),
    class: reader.read(16)
  });
  
  return packet;
};

function serializeDomainName(name){
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
