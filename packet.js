const _ = require('./consts');
/**
 * [Packet description]
 * @param {[type]} data [description]
 * @docs https://tools.ietf.org/html/rfc1034
 * @docs https://tools.ietf.org/html/rfc1035
 *
 * <Buffer 29 64 01 00 00 01 00 00 00 00 00 00 
 *       |-ID----------- HEADER ----------->| 
 *      
 *  03 77 77 77 01 7a 02 63 6e 00 00 01 00 01>
 *   <-W--W--W-----Z-----C--N>|<----------->|
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

  if(data instanceof Packet){
    return data;
  }
  
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

  if(buffer.length < 12){
    throw new Error('parse error');
  }

  var offset = 0;
  var read = function(size){
    var val = Packet.read(buffer, offset, size);
    offset += size;
    return val;
  };

  var packet = new Packet();
  // header section
  packet.header.id     = read(16);
  packet.header.qr     = read(1);
  packet.header.opcode = read(4);
  packet.header.aa     = read(1);
  packet.header.tc     = read(1);
  packet.header.rd     = read(1);
  packet.header.ra     = read(1);
  packet.header.z      = read(3);
  packet.header.rcode  = read(4);

  var question   = read(16);
  var answer     = read(16);
  var authority  = read(16);
  var additional = read(16);
  
  var b = 0, name = '';

  // question section
  if(question){
    
    do{ 
      b = read(8);
      if(b){
        while(b--) name += String.fromCharCode(read(8));  
        name += '.';
      }
    }while(b);

    packet.question.push({
      name: name,
      type: read(16),
      class: read(16)
    });
  }

  // answer section
  if(answer){

    var mv = read(8);
    var to = read(8);

    var data = {
      name : name,
      type : read(16),
      class: read(16),
      ttl  : read(32), 
    };
      
    var len = read(16);

    switch(data.type){
      case _.QUERY_TYPE.A:
        var address = [];
        while(len--) address.push(read(8))
        data.address = address.join('.');
        packet.answer.push(data);
        break;
    }
  }
  
  return packet;
};

/**
 * [toBuffer description]
 * @return {[type]} [description]
 */
Packet.prototype.toBuffer = function(){
  var response = new Buffer([ 
    0x29, 0x64, 0x81, 0x80, 0x00, 0x01, 0x00, 0x01, 
    0x00, 0x00, 0x00, 0x00, 0x03, 0x77, 0x77, 0x77, 
    0x01, 0x7a, 0x02, 0x63, 0x6e, 0x00, 0x00, 0x01, 
    0x00, 0x01, 0xc0, 0x0c, 0x00, 0x01, 0x00, 0x01, 
    0x00, 0x00, 0x01, 0x90, 0x00, 0x04, 0x36, 0xde, 
    0x3c, 0xfc ]);
   
  return response;
};

module.exports = Packet;
