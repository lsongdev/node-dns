/**
 * [Writer description]
 */
function BufferWriter() {
  this.buffer = [];
}

/**
 * [write description]
 * @param  {[type]} d    [description]
 * @param  {[type]} size [description]
 * @return {[type]}      [description]
 */
BufferWriter.prototype.write = function (d, size) {
  for (let i = size - 1; i >= 0; i--) {
    this.buffer.push((d >>> i) & 1);
  }
};

/**
 * [writeBuffer description]
 * @param {[type]} b [description]
 */
BufferWriter.prototype.writeBuffer = function (b) {
  this.buffer = this.buffer.concat(b.buffer);
};

// Current write position, in bits.
BufferWriter.prototype.bitLength = function () {
  return this.buffer.length;
};

// Current write position, in bytes. Defined when DNS encoding has stayed on
// byte boundaries (it always does at the points we expose this).
BufferWriter.prototype.byteLength = function () {
  return this.buffer.length / 8;
};

// Overwrite `size` bits at `bitOffset` with `value`. Used to back-fill
// placeholders (e.g. RDLENGTH) once the field's contents have been written.
BufferWriter.prototype.patch = function (bitOffset, value, size) {
  for (let i = 0; i < size; i++) {
    this.buffer[bitOffset + i] = (value >>> (size - i - 1)) & 1;
  }
};

/**
 * [toBuffer description]
 * @return {[type]} [description]
 */
BufferWriter.prototype.toBuffer = function () {
  const bytes = Buffer.alloc(Math.ceil(this.buffer.length / 8));
  for (let i = 0; i < this.buffer.length; i++) {
    if (this.buffer[i]) bytes[i >>> 3] |= 0x80 >>> (i & 7);
  }
  return bytes;
};

module.exports = BufferWriter;
