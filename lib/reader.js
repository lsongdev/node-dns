
/**
 * [Reader description]
 * @param {[type]} buffer [description]
 * @param {[type]} offset [description]
 */
function BufferReader(buffer, offset){
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
BufferReader.read = function(buffer, offset, length){
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
BufferReader.prototype.read = function(size){
  var val = BufferReader.read(this.buffer, this.offset, size);
  this.offset += size;
  return val;
};


module.exports = BufferReader;