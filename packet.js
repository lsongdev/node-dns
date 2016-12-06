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
Packet.Name.parse = function(buffer, offset){
  offset = offset || 12;
  var b = 0, name = [];
  do{
    b = buffer[ offset++ ];
    if(b === 0xc0){ // copy
      var to = buffer[ offset++ ];
      return {
        offset: offset,
        value : Packet.Name.parse(buffer, to).value
      };
    }else{
      if(b){
        var part = '';
        while(b--) part += String.fromCharCode(buffer[ offset++ ]);
        name.push(part);
      }
    }
  }while(b);
  return {
    offset: --offset,
    value : name.join('.')
  };
};

/**
 * [Header description]
 * @param {[type]} options [description]
 */
Packet.Header = function(options){
  this.id     = 0;
  this.qr     = 0;
  this.opcode = 0;
  this.aa     = 0;
  this.tc     = 0;
  this.rd     = 0;
  this.ra     = 0;
  this.z      = 0;
  this.rcode  = 0;
  for(var k in options){
    this[ k ] = options[ k ];
  }
  return this;
};

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

Packet.Question = function(){
  this.name = '';
  this.type = 0;
  this.class= 0;
};

Packet.Question.parse = function(reader){
  var question = new Packet.Question();
  if(reader instanceof Buffer){
    reader = new Packet.Reader(reader);
  }
  var name = Packet.Name.parse(reader.buffer);
  question.name = name.value;
  reader.offset = name.offset;
  question.type = reader.read(16);
  question.class= reader.read(16);
  return question;
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
  ([
    [ 'questions'   , 'Question'  , reader.read(16) ],
    [ 'answers'     , 'Answer'    , reader.read(16) ],
    [ 'authorities' , 'Authority' , reader.read(16) ],
    [ 'additionals' , 'Additional', reader.read(16) ]
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
