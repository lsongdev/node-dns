

/**
 * [Writer description]
 */
function BufferWriter(){
  this.buffer = [];
};

/**
 * [write description]
 * @param  {[type]} d    [description]
 * @param  {[type]} size [description]
 * @return {[type]}      [description]
 */
BufferWriter.prototype.write = function(d, size){
  for(var i = 0; i < size; i++)
    this.buffer.push((d & Math.pow(2, size - i - 1 )) ? 1 : 0);
};

/**
 * [toBuffer description]
 * @return {[type]} [description]
 */
BufferWriter.prototype.toBuffer = function(){
  var arr = [];
  for(var i = 0; i < this.buffer.length; i += 8){
    var chunk = this.buffer.slice(i, i + 8);
    arr.push(parseInt(chunk.join(''), 2));
  }
  return Buffer.from(arr);
};

module.exports = BufferWriter;
