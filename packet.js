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
  this.header = new Packet.Header(data);
  this.questions   = [];
  this.answers     = [];
  this.authorities = [];
  this.additionals = [];
  
  if(data instanceof Buffer){
    data = Packet.parse(data);
  }
  
  return this;
};



/**
 * [QUERY_TYPE description]
 * @type {Object}
 * @docs https://tools.ietf.org/html/rfc1035#section-3.2.2
 */
Packet.TYPE = {
  A     : 0x01,
  NS    : 0x02,
  MD    : 0x03,
  MF    : 0x04,
  CNAME : 0x05,
  SOA   : 0x06,
  MB    : 0x07,
  MG    : 0x08,
  MR    : 0x09,
  NULL  : 0x0A,
  WKS   : 0x0B,
  PTR   : 0x0C,
  HINFO : 0x0D,
  MINFO : 0x0E,
  MX    : 0x0F,
  TXT   : 0x10,
  AXFR  : 0xFC,
  MAILB : 0xFD,
  MAILA : 0xFE,
  ANY   : 0xFF,
};
/**
 * [QUERY_CLASS description]
 * @type {Object}
 * @docs https://tools.ietf.org/html/rfc1035#section-3.2.4
 */
Packet.CLASS = {
  IN : 0x01,
  CS : 0x02,
  CH : 0x03,
  HS : 0x04,
  ANY: 0xFF
};


/**
 * [Writer description]
 */
Packet.Writer = function(){
  this.buffer = [];
};

/**
 * [write description]
 * @param  {[type]} d    [description]
 * @param  {[type]} size [description]
 * @return {[type]}      [description]
 */
Packet.Writer.prototype.write = function(d, size){
  for(var i = 0; i < size; i++)
    this.buffer.push((d & Math.pow(2, size - i - 1 )) ? 1 : 0);
};

/**
 * [toBuffer description]
 * @return {[type]} [description]
 */
Packet.Writer.prototype.toBuffer = function(){
  var arr = [];
  for(var i = 0; i < this.buffer.length; i += 8){
    var chunk = this.buffer.slice(i, i + 8);
    arr.push(parseInt(chunk.join(''), 2));
  }
  return new Buffer(arr);
};

/**
 * [Reader description]
 * @param {[type]} buffer [description]
 * @param {[type]} offset [description]
 */
Packet.Reader = function(buffer, offset){
  this.buffer = buffer;
  this.offset = offset || 0;
  return this;
};

/**
 * [read description]
 * @param  {[type]} buffer [description]
 * @param  {[type]} offset [description]
 * @param  {[type]} length [description]
 * @return {[type]}        [description]
 */
Packet.Reader.read = function(buffer, offset, length){
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
 * [read description]
 * @param  {[type]} size [description]
 * @return {[type]}      [description]
 */
Packet.Reader.prototype.read = function(size){
  var val = Packet.Reader.read(this.buffer, this.offset, size);
  this.offset += size;
  return val;
};

/**
 * [encode_name description]
 * @param  {[type]} domain [description]
 * @return {[type]}        [description]
 */
Packet.Name = function(domain){
  if(!(this instanceof Packet.Name)){
    return Packet.Name.prototype.toBuffer(domain);
  }
  this.domain = domain;
};

/**
 * [toBuffer description]
 * @param  {[type]} domain [description]
 * @return {[type]}        [description]
 */
Packet.Name.prototype.toBuffer = function(domain){
  var arr = [];
  domain = domain || this.domain;
  domain.split('.').filter(function(part){
    return !!part;
  }).map(function(part){
    arr = arr.concat.apply(arr, [ part.length, part.split('').map(function(c){
      return c.charCodeAt(0);
    }) ]);
  });
  return new Buffer(arr);
};

/**
 * [decode_name description]
 * @param  {[type]} buffer [description]
 * @param  {[type]} offset [description]
 * @return {[type]}        [description]
 */
Packet.Name.parse = function(reader){
  var b = 0, name = [];
  do{
    b = reader.read(8);
    if(b === 0xc0){ // copy
      var jump = 8 * reader.read(8);
      var reader2 = new Packet.Reader(reader.buffer, jump);
      return Packet.Name.parse(reader2);
    }else{
      if(b){
        var part = '';
        while(b--) part += String.fromCharCode(reader.read(8));
        name.push(part);
      }
    }
  }while(b);
  return name.join('.');
};

/**
 * [Header description]
 * @param {[type]} options [description]
 * @docs https://tools.ietf.org/html/rfc1035#section-4.1.1
 */
Packet.Header = function(header){
  this.id     = 0;
  this.qr     = 0;
  this.opcode = 0;
  this.aa     = 0;
  this.tc     = 0;
  this.rd     = 0;
  this.ra     = 0;
  this.z      = 0;
  this.rcode  = 0;
  for(var k in header){
    this[ k ] = header[ k ];
  }
  return this;
};
/**
 * [toBuffer description]
 * @return {[type]} [description]
 */
Packet.Header.prototype.toBuffer = function(){
  var writer = new Packet.Writer();
  writer.write(this.id    , 16)
  writer.write(this.qr    , 1)
  writer.write(this.opcode, 4)
  writer.write(this.aa    , 1)
  writer.write(this.tc    , 1)
  writer.write(this.rd    , 1)
  writer.write(this.ra    , 1)
  writer.write(this.z     , 3)
  writer.write(this.rcode , 4)
  return writer.toBuffer();
};
/**
 * [parse description]
 * @param  {[type]} buffer [description]
 * @return {[type]}        [description]
 * @docs https://tools.ietf.org/html/rfc1035#section-4.1.1
 */
Packet.Header.parse = function(reader){
  var header = new Packet.Header();
  if(reader instanceof Buffer){
    reader = new Packet.Reader(reader);
  }
  header.id     = reader.read(16);
  header.qr     = reader.read(1);
  header.opcode = reader.read(4);
  header.aa     = reader.read(1);
  header.tc     = reader.read(1);
  header.rd     = reader.read(1);
  header.ra     = reader.read(1);
  header.z      = reader.read(3);
  header.rcode  = reader.read(4);
  return header;
};

/**
 * Question section format
 * @docs https://tools.ietf.org/html/rfc1035#section-4.1.2
 */
Packet.Question = function(name, type, cls){
  this.name = name || '';
  this.type = type || 0;
  this.class= cls  || 0;
  return this;
};
/**
 * [parse description]
 * @param  {[type]} reader [description]
 * @return {[type]}        [description]
 */
Packet.Question.parse = function(reader){
  var question = new Packet.Question();
  if(reader instanceof Buffer){
    reader = new Packet.Reader(reader);
  }
  question.name = Packet.Name.parse(reader);
  question.type = reader.read(16);
  question.class= reader.read(16);
  return question;
};
/**
 * Resource record format
 * @docs https://tools.ietf.org/html/rfc1035#section-4.1.3
 */
Packet.Resource = function(name, type, cls, ttl, len, data){
  this.name   = name;
  this.type   = type;
  this.class  = cls;
  this.ttl    = ttl;
  return this;
};

Packet.Resource.parse = function(reader){
  var resource = new Packet.Resource();
  if(reader instanceof Buffer){
    reader = new Packet.Reader(reader);
  }
  resource.name   = Packet.Name.parse(reader);
  resource.type   = reader.read(16);
  resource.class  = reader.read(16);
  resource.ttl    = reader.read(32);
  var length = reader.read(16);
  var parser = Object.keys(Packet.TYPE).filter(function(type){
    return resource.type === Packet.TYPE[ type ];
  })[0];
  switch (parser) {
    case 'A':
      var parts = [];
      while(length--) parts.push(reader.read(8));
      resource.host = parts.join('.');
      break;
  }
  return resource;
};


/**
 * [toBuffer description]
 * @return {[type]} [description]
 */
Packet.prototype.toBuffer = function(){
  var writer = new Packet.Writer();
  writer.write(this.header.toBuffer());
  writer.write(this.questions  .length, 16)
  writer.write(this.answers    .length, 16)
  writer.write(this.authorities.length, 16)
  writer.write(this.additionals.length, 16)
  // questions
  this.questions.forEach(function(question){
    writer.write(question.toBuffer());
  });
  // answers
  this.answers.forEach(function(answer){
    writer.write(answer.toBuffer());
  });
  // authorities
  this.authorities.forEach(function(authority){
    writer.write(authority.toBuffer());
  });
  // additionals
  this.additionals.forEach(function(additional){
    writer.write(additional.toBuffer());
  });
  return writer.toBuffer();
};

/**
 * [parse description]
 * @param  {[type]} buffer [description]
 * @return {[type]}        [description]
 */
Packet.parse = function(buffer){
  var packet = new Packet();
  var reader = new Packet.Reader(buffer);
  packet.header = Packet.Header.parse(reader);
  ([ // props           parser      count
    [ 'questions'   , 'Question', reader.read(16) ],
    [ 'answers'     , 'Resource', reader.read(16) ],
    [ 'authorities' , 'Resource', reader.read(16) ],
    [ 'additionals' , 'Resource', reader.read(16) ]
  ]).forEach(function(def){
    var section = def[0];
    var parser  = def[1];
    var count   = def[2];
    if(parser in Packet){
      while(count--){
        packet[ section ] = packet[ section ] || [];
        packet[ section ].push( Packet[ parser ].parse(reader) );
      }
    }else{
      console.error('unknow parser: ' + parser );
    }
  });
  return packet;
};

module.exports = Packet;
