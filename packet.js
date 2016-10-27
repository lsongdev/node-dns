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
    rd: 0,
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
      l = Math.floor(offset / 8),
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
 * [toBuffer description]
 * @return {[type]} [description]
 */
Packet.prototype.toBuffer = function(){
  var arr = [], self = this;
  function write(d, size){
    for(var i=0;i<size;i++)
      arr.push((d & Math.pow(2, size - i - 1 )) ? 1 : 0);
  }
  write(this.header.id    , 16)
  write(this.header.qr    , 1)
  write(this.header.opcode, 4)
  write(this.header.aa    , 1)
  write(this.header.tc    , 1)
  write(this.header.rd    , 1)
  write(this.header.ra    , 1)
  write(this.header.z     , 3)
  write(this.header.rcode , 4)
  write(this.question  .length, 16)
  write(this.answer    .length, 16)
  write(this.authority .length, 16)
  write(this.additional.length, 16)
  
  this.question.forEach(function(question){
    // question name
    question.name.split('.').map(function(part){
      
      write(part.length, 8);
      part.split('').map(function(c){
        write(c.charCodeAt(0), 8);
      });
            
    });
    
    write(0, 8);
    write(question.type  , 16);
    write(question.class , 16);
    
  });
  
  this.answer.forEach(function(answer){
    if(answer.name == self.question[0].name){
      write(0xc0, 8);
      write(0x0c, 8);
      write(answer.type  , 16);
      write(answer.class , 16);
      write(answer.ttl   , 32);
      
      var parts = answer.address.split('.');
      
      write(parts.length, 16);
      parts.forEach(function(part){
        write(part, 8);
      });
      
    }
  })
  
  var arr2 = [];
  for(var i=0; i<arr.length; i+=8){
    var chunk = arr.slice(i, i + 8);
    arr2.push(parseInt(chunk.join(''), 2));
  }
  
  return new Buffer(arr2);
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
  // Header section
  // https://tools.ietf.org/html/rfc1035#section-4.1.1
  packet.header.id     = read(16);
  packet.header.qr     = read(1);
  packet.header.opcode = read(4);
  packet.header.aa     = read(1);
  packet.header.tc     = read(1);
  packet.header.rd     = read(1);
  packet.header.ra     = read(1);
  packet.header.z      = read(3);
  packet.header.rcode  = read(4);

  // QDCOUNT
  var question   = read(16);
  // ANCOUNT
  var answer     = read(16);
  // NSCOUNT
  var authority  = read(16);
  // ARCOUNT
  var additional = read(16);
  
  var b = 0, name = '';

  // question section
  // https://tools.ietf.org/html/rfc1035#section-4.1.2
  
  var rr =  [
    [ 'question'  , question    ],
    [ 'answer'    , answer      ],
    [ 'authority' , authority   ],
    [ 'additional', additional  ]
  ];
  
  rr.forEach(function(x, section_index){
    var section = x[0], section_count = x[1];
    while(section_count--){
      
      do{ 
        b = read(8);
        if(b === 0xc0){
          read(8);
          break;
        }
        if(b){
          while(b--) name += String.fromCharCode(read(8));  
          name += '.';
        }
      }while(b);

      var data = {
        name : name,
        type : read(16),
        class: read(16)
      };
      
      if(section_index > 0){
        data.ttl = read(32);
        var len = read(16);
        while(len--) read(8);
      }
      
      packet[ section ].push(data);
      
    }
  });
  return packet;
};

module.exports = Packet;
