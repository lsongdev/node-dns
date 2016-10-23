const util         = require('util');
const dgram        = require('dgram');
const EventEmitter = require('events');
/**
 * [DNSServer description]
 * @docs https://tools.ietf.org/html/rfc1035
 */
function DNSServer(){
  this.udp = dgram.createSocket('udp4');
  this.udp.on('message', this.parse.bind(this));
};

util.inherits(DNSServer, EventEmitter);

/**
 * [parse description]
 * @param  {[type]} msg [description]
 * @return {[type]}     [description]
 */
DNSServer.prototype.parse = function(msg){
  var offset = 0;
  var header = {
    id: msg.readUInt16BE(offset)
  };
  offset+=2;
  var val = msg.readUInt16BE(offset); 
  offset+=2;

  header.qr      = (val & 0x8000) >> 15;
  header.opcode  = (val & 0x7800) >> 11;
  header.aa      = (val & 0x400)  >> 10;
  header.tc      = (val & 0x200)  >> 9;
  header.rd      = (val & 0x100)  >> 8;
  header.ra      = (val & 0x80)   >> 7;
  header.res1    = (val & 0x40)   >> 6;
  header.res2    = (val & 0x20)   >> 5;
  header.res3    = (val & 0x10)   >> 4;
  header.rcode   = (val & 0xF);

  var question   = msg.readUInt16BE(offset); offset+=2;
  var answer     = msg.readUInt16BE(offset); offset+=2;
  var authority  = msg.readUInt16BE(offset); offset+=2;
  var additional = msg.readUInt16BE(offset); offset+=2;
  // parse address
  function parseDomainName(str){
    str = str || '';
    var len = msg.readUInt8(offset++);
    if(len == 0) return str;
    while(len--)
      str += String.fromCharCode(msg.readUInt8(offset++));
    return parseDomainName(str + '.');
  }
  var domain = parseDomainName();
  var type   = msg.readUInt16BE(offset); offset+=2;
  var cls    = msg.readUInt16BE(offset); offset+=2;
  //
  var obj = {
    header    : header    , 
    question  : question  , 
    answer    : answer    , 
    authority : authority , 
    additional: additional, 
    domain    : domain    ,
    type      : type      ,
    class     : cls
  };

  this.emit('request', obj);
  return obj;
};

/**
 * [listen description]
 * @param  {[type]}   port     [description]
 * @param  {Function} callback [description]
 * @return {[type]}            [description]
 */
DNSServer.prototype.listen = function(port, callback){
  if(callback) this.udp.on('listening', callback);
  this.udp.bind(port);
};

// 00000000

// <Buffer 29 64 01 00 00 01 00 00 00 00 00 00 03 77 77 77 01 7a 02 63 6e 00 00 01 00 01>
//        |-ID----------- HEADER ----------->| |<-W--W--W-----Z-----C--N>|<------------>|

module.exports = DNSServer;