/**
 * [Request description]
 * @param {[type]} data [description]
 * @docs https://tools.ietf.org/html/rfc1034
 * @docs https://tools.ietf.org/html/rfc1035
 *
 * <Buffer 29 64 01 00 00 01 00 00 00 00 00 00 03 77 77 77 01 7a 02 63 6e 00 00 01 00 01>
 *        |-ID----------- HEADER ----------->| |<-W--W--W-----Z-----C--N>|<------------>|
 */
function Request(data){
  this.data = data || {};
  this.header = {};
  if(data instanceof Buffer){
    this.parse(data);
  }
  return this;
};

Request.prototype.toBuffer = function(){
  this.write(this.header.id, 0x16);
  this.write(this.header.qr);
  this.write(this.header.opcode);
  this.write(this.header.aa);
  this.write(this.header.tc);
  this.write(this.header.rd);
  this.write(this.header.ra);
  this.write(this.header.res1);
  this.write(this.header.res2);
  this.write(this.header.res3);
  this.write(this.header.rcode);
  this.write(this.answer,     0x16);
  this.write(this.authority,  0x16);
  this.write(this.additional, 0x16);
  this.write(this.serializeDomainName(this.name), 0x16);
  this.write(0, 0x08);
  this.write(this.type,  0x16);
  this.write(this.class, 0x16);
  return new Buffer([]);
};

/**
 * [parse description]
 * @param  {[type]} data [description]
 * @return {[type]}      [description]
 */
Request.prototype.parse = function(data){
  this.header.id     = this.read(0, 16);
  
  this.header.qr     = this.read(17, 1);
  this.header.opcode = this.read(18, 4);
  this.header.aa     = this.read(22);
  this.header.tc     = this.read(23);
  this.header.rd     = this.read(24);
  this.header.ra     = this.read(25);
  this.header.res1   = this.read(26);
  this.header.res2   = this.read(27);
  this.header.res3   = this.read(28);
  this.header.rcode  = this.read(29, 4);
  
  this.question      = this.read(33, 16);
  this.answer        = this.read(49, 16);
  this.authority     = this.read(65, 16);
  this.additional    = this.read(81, 16);
  this.name  = this.parseDomainName();
  this.type  = this.read(2);
  this.class = this.read(2);
  return this;
};

/**
 * [parseDomainName description]
 * @param  {[type]} str [description]
 * @return {[type]}     [description]
 */
Request.prototype.parseDomainName = function(str){
  str = str || '';
  var len = this.read();
  if(len == 0) return str;
  while(len--)
    str += String.fromCharCode(this.read());
  return this.parseDomainName(str + '.');
}

Request.prototype.serializeDomainName = function(name){
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

Request.prototype.read = function(offset, size){
  
};

Request.prototype.write = function(d, size) {
  
};

module.exports = Request;
