const assert = require('assert');
const Packet = require('../packet');

var request = new Buffer([
0x29, 0x64, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00,
0x00, 0x00, 0x00, 0x00, 0x06, 0x67, 0x6f, 0x6f,
0x67, 0x6c, 0x65, 0x03, 0x63, 0x6f, 0x6d, 0x00,
0x00, 0x01, 0x00, 01 ]);

var response = new Buffer([ 
0x29, 0x64, 0x81, 0x80, 0x00, 0x01, 0x00, 0x01, 
0x00, 0x00, 0x00, 0x00, 0x03, 0x77, 0x77, 0x77, 
0x01, 0x7a, 0x02, 0x63, 0x6e, 0x00, 0x00, 0x01, 
0x00, 0x01, 0xc0, 0x0c, 0x00, 0x01, 0x00, 0x01, 
0x00, 0x00, 0x01, 0x90, 0x00, 0x04, 0x36, 0xde, 
0x3c, 0xfc ]);

describe('DNS Packet', function(){
  
  it('Name#encode', function(){
    var name = Packet.Name.encode('www.google.com');
    var pattern = [ 3,'w','w','w',5,'g','o','o','g','l','e',3,'c','o','m', '0' ];
    assert.equal(name.length, pattern.length);
  });
  
  it('Name#decode', function(){
    var reader = new Packet.Reader(response, 8 * 12);
    var name = Packet.Name.decode(reader);
    assert.equal(name, 'www.z.cn');
    
    reader.offset = 8 * 26;
    var name = Packet.Name.decode(reader);
    assert.equal(reader.offset, 8 * 28);
    assert.equal(name, 'www.z.cn');
    
  });
  
  it('Header#encode', function(){
    var header = new Packet.Header({ id: 0x2964, qr: 1 });
    header.qdcount = 1;
    header.ancount = 2;
    assert.deepEqual(header.toBuffer(), new Buffer([
      0x29, 0x64, 0x80,0x00, 0x00, 0x01, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00 ]));
  });
  
  it('Header#parse', function(){
    var header = Packet.Header.parse(response);
    assert.equal(header.id    , 0x2964);
    assert.equal(header.qr    , 1);
    assert.equal(header.opcode, 0);
    assert.equal(header.aa    , 0);
    assert.equal(header.tc    , 0);
    assert.equal(header.rd    , 1);
    assert.equal(header.z     , 0);
    assert.equal(header.rcode , 0);
    assert.equal(header.qdcount, 1);
    assert.equal(header.ancount, 1);
    assert.equal(header.nscount, 0);
    assert.equal(header.arcount, 0);
  });
  
  it('Question#encode', function(){
    
    var question = new Packet.Question({
      name: 'google.com',
      type: Packet.TYPE.A,
      class: Packet.CLASS.IN
    });
    // 
    assert.deepEqual(question.toBuffer(), new Buffer([
      0x06, 0x67, 0x6f, 0x6f, 0x67, 0x6c, 0x65, 0x03, 
      0x63, 0x6f, 0x6d, 0x00, 0x00, 0x01, 0x00, 0x01
    ]));
  });
  
  it('Question#decode', function(){
    
    var question = new Packet.Question('google.com', 
      Packet.TYPE.A, Packet.CLASS.IN);
    assert.deepEqual(question.toBuffer(), new Buffer([
      0x06, 0x67, 0x6f, 0x6f, 0x67, 0x6c, 0x65, 0x03, 
      0x63, 0x6f, 0x6d, 0x00, 0x00, 0x01, 0x00, 0x01
    ]));
  });
  
  // 
  it('Packet#parse', function(){
    var packet = Packet.parse(response);
    assert.equal(packet.questions[0].name , 'www.z.cn');
    assert.equal(packet.questions[0].type , Packet.TYPE.A);
    assert.equal(packet.questions[0].class, Packet.CLASS.IN);
    assert.equal(packet.answers[0].class, Packet.TYPE.A);
    assert.equal(packet.answers[0].class, Packet.CLASS.IN);
    assert.equal(packet.answers[0].address, '54.222.60.252');
  });
  // 
  it('Packet#encode', function(){
    
    var packet = new Packet({
      id: 10596,
      qr: 0,
      rd: 1
    });
    packet.questions.push({
      name: 'google.com', 
      type: Packet.TYPE.A,
      class: Packet.CLASS.IN
    });
    assert.deepEqual(packet.toBuffer(), request);
    
  });
  
  it('Packet#encode', function(){
    
    var packet = new Packet({
      id: 10596,
      qr: 1,
      rd: 1,
      ra: 1
    });
    
    packet.questions.push(new Packet.Question('www.z.cn'));
    packet.answers.push(new Packet.Resource.A('192.168.1.1'));
    assert.deepEqual(Packet.parse(packet.toBuffer()), packet);
    
  });
  
});