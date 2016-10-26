/**
 * [Packet description]
 * @param {[type]} data [description]
 * @docs https://tools.ietf.org/html/rfc1034
 * @docs https://tools.ietf.org/html/rfc1035
 *
 * <Buffer 29 64 01 00 00 01 00 00 00 00 00 00 03 77 77 77 01 7a 02 63 6e 00 00 01 00 01>
 *        |-ID----------- HEADER ----------->| |<-W--W--W-----Z-----C--N>|<------------>|
 */
function Packet(data){
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
  
  if(data instanceof Buffer){
    data = Packet.parse(data);
  }
  if(typeof data !== 'undefined'){
    for(var key in data){
      this[ key ] = data[key];
    }
  }
  
  return this;
};
/**
 * [read description]
 * @param  {[type]} buffer [description]
 * @param  {[type]} offset [description]
 * @param  {[type]} length [description]
 * @return {[type]}        [description]
 */
Packet.read = function(buffer, offset, length){
  var a = [], 
      c = Math.ceil(length / 8),
      l = Math.ceil(offset / 8),
      m = offset % 8
  function t(n){  
    var r = [ 0,0,0,0, 0,0,0,0 ];
    for (var i = 7; i >= 0; i--) {
      r[7 - i] = n & Math.pow(2, i) ? 1 : 0;
    }
    a = a.concat(r);
  }
  function p(a){
    var n = 0;
    var f = a.length - 1;
    for(var i = f;i >= 0;i--)
      if(a[ f - i ]) n += Math.pow(2, i);
    return n;
  }
  while(c--) t(buffer.readUInt8(l++));
  return p(a.slice(m, m + length))
};

/**
 * [parse description]
 * @param  {[type]} buffer [description]
 * @return {[type]}        [description]
 */
Packet.parse = function(buffer){
  var offset = 0;
  var read = function(size){
    var val = Packet.read(buffer, offset, size);
    offset += size;
    return val;
  };
  var packet = new Packet();
  
  packet.header.id     = read(16);
  packet.header.qr     = read(1);
  packet.header.opcode = read(4);
  packet.header.aa     = read(1);
  packet.header.tc     = read(1);
  packet.header.rd     = read(1);
  packet.header.ra     = read(1);
  packet.header.z      = read(3);
  packet.header.rcode  = read(4);

  var question         = read(16);
  var answer           = read(16);
  var authority        = read(16);
  var additional       = read(16);
  
  // var b = 0, name;
  // 
  // if(question){
  //   
  //   b = 0;
  //   name = Packet.decode_name(buffer, offset / 8);
  //   do{ b = read(8) }while(b);
  //   packet.question.push({
  //     name: name,
  //     type: read(16),
  //     class: read(16)
  //   });
  // }
  // 
  // if(answer){
  //   b = 0;
  //   name = Packet.decode_name(buffer, offset / 8);
  //   do{ b = read(8); }while(b);
  //   packet.answer.push({
  //     name: name,
  //     type: read(16),
  //     class: read(16)
  //   })
  // }
  
  return packet;
};

/**
 * [decode_name description]
 * @param  {[type]} buffer [description]
 * @param  {[type]} offset [description]
 * @param  {[type]} str    [description]
 * @return {[type]}        [description]
 */
Packet.decode_name = function(buffer, offset, str){
  str    = str    || '';
  offset = offset || 0;
  var len = buffer.readUInt8(offset);
  if(len === 0) return str;
  if(len === 0xc0){
    offset = buffer.readUInt8(++offset);
    return Packet.decode_name(buffer, offset);
  }
  
  while(len--) 
    str += String.fromCharCode(buffer.readUInt8(++offset));
  return Packet.decode_name(buffer, ++offset, str + '.');
}

/**
 * [decode_name2 description]
 * @param  {[type]} buffer [description]
 * @param  {[type]} offset [description]
 * @param  {[type]} str    [description]
 * @return {[type]}        [description]
 */
Packet.decode_name2 = function(buffer, offset, str){
  var len, str = '';
  do{
    len = buffer.readUInt8(offset++);
    if(len === 0xc0) {
      offset = buffer.readUInt8(offset);
      continue;
    }
    if(len){
      while(len--) 
        str += String.fromCharCode(buffer.readUInt8(offset++));
      str += '.';
    }
  }while(len);
};

/**
 * [toBuffer description]
 * @return {[type]} [description]
 */
Packet.prototype.toBuffer = function(){
  var query = new Buffer([ 0x29 ,0x64 ,0x01 ,0x00 ,0x00 ,0x01 ,0x00 ,0x00 ,0x00 ,0x00 ,0x00 ,0x00 ,0x03 ,0x77 ,0x77 ,0x77 ,0x01 ,0x7a ,0x02 ,0x63 ,0x6e ,0x00 ,0x00 ,0x01 ,0x00 ,0x01 ]);
  return query;
};

function encode_name(name){
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
