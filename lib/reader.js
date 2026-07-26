/**
 * [Reader description]
 * @param {[type]} buffer [description]
 * @param {[type]} offset [description]
 */
function BufferReader(buffer, offset) {
  this.buffer = buffer;
  this.offset = offset || 0;
  return this;
}

/**
 * [read description]
 * @param  {[type]} buffer [description]
 * @param  {[type]} offset [description]
 * @param  {[type]} length [description]
 * @return {[type]}        [description]
 * @throws {RangeError} when the range extends past the end of the buffer
 */
BufferReader.read = function (buffer, offset, length) {
  const end = offset + length;
  if (offset < 0 || length < 0 || end > buffer.length * 8) {
    throw new RangeError(
      `read past end of message: wanted ${length} bits at bit offset ${offset}, ` +
        `message is ${buffer.length} octets (${buffer.length * 8} bits)`,
    );
  }
  // Accumulate with multiplication: a 32-bit TTL read would otherwise overflow
  let n = 0;
  for (let bit = offset; bit < end; bit++) {
    n = n * 2 + ((buffer[bit >>> 3] >>> (7 - (bit & 7))) & 1);
  }
  return n;
};

/**
 * [read description]
 * @param  {[type]} size [description]
 * @return {[type]}      [description]
 */
BufferReader.prototype.read = function (size) {
  const val = BufferReader.read(this.buffer, this.offset, size);
  this.offset += size;
  return val;
};

/**
 * Bits left between the cursor and the end of the message.
 * @return {number}
 */
BufferReader.prototype.remaining = function () {
  return Math.max(0, this.buffer.length * 8 - this.offset);
};

module.exports = BufferReader;
