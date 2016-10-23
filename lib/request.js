
/**
 * [Request description]
 * @param {[type]} data [description]
 * <Buffer 29 64 01 00 00 01 00 00 00 00 00 00 03 77 77 77 01 7a 02 63 6e 00 00 01 00 01>
 *        |-ID----------- HEADER ----------->| |<-W--W--W-----Z-----C--N>|<------------>|
 */
function Request(data){
  if(data){
    this.data = data;
    this.parse(data);
  }
  return this;
};


Request.prototype.parse = function(data){
  this.offset = 0;
  this.header = { id: this.read(2) };
  var val = this.read(2);
  this.header.qr     = (val & 0x8000) >> 15;
  this.header.opcode = (val & 0x7800) >> 11;
  this.header.aa     = (val & 0x400)  >> 10;
  this.header.tc     = (val & 0x200)  >> 9;
  this.header.rd     = (val & 0x100)  >> 8;
  this.header.ra     = (val & 0x80)   >> 7;
  this.header.res1   = (val & 0x40)   >> 6;
  this.header.res2   = (val & 0x20)   >> 5;
  this.header.res3   = (val & 0x10)   >> 4;
  this.header.rcode  = (val & 0xF);
  this.question   = this.read(2);
  this.answer     = this.read(2);
  this.authority  = this.read(2);
  this.additional = this.read(2);
  this.name   = this.parseDomainName();
  this.type   = this.read(2);
  this.class  = this.read(2);
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
/**
 * [read description]
 * @param  {[type]} size [description]
 * @return {[type]}      [description]
 */
Request.prototype.read = function(size){
  size = size || 1;
  var b = null;
  if(size == 1) b = this.data.readUInt8   (this.offset);
  if(size == 2) b = this.data.readUInt16BE(this.offset);
  if(size == 4) b = this.data.readUInt32BE(this.offset);
  this.offset += size;
  return b;
};

module.exports = Request;