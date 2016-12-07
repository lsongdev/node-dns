const assert = require('assert');
const Packet = require('../packet');

var request = new Buffer([ 
0x29 ,0x64 ,0x01 ,0x00 ,0x00 ,0x01 ,0x00 ,0x00,
0x00 ,0x00 ,0x00 ,0x00 ,0x03 ,0x77 ,0x77 ,0x77,
0x01 ,0x7a ,0x02 ,0x63 ,0x6e ,0x00 ,0x00 ,0x01,
0x00 ,0x01 ]);

var response = new Buffer([ 
0x29, 0x64, 0x81, 0x80, 0x00, 0x01, 0x00, 0x01, 
0x00, 0x00, 0x00, 0x00, 0x03, 0x77, 0x77, 0x77, 
0x01, 0x7a, 0x02, 0x63, 0x6e, 0x00, 0x00, 0x01, 
0x00, 0x01, 0xc0, 0x0c, 0x00, 0x01, 0x00, 0x01, 
0x00, 0x00, 0x01, 0x90, 0x00, 0x04, 0x36, 0xde, 
0x3c, 0xfc ]);

describe('DNS Packet', function(){
  
  it('Name#decode', function(){
    
    
    var reader = new Packet.Reader(response, 8 * 12);
    var name = Packet.Name.parse(reader);
    assert.equal(name, 'www.z.cn');
    reader.offset = 8 * 26;
    var name = Packet.Name.parse(reader);
    assert.equal(reader.offset, 8 * 28);
    assert.equal(name, 'www.z.cn');
    
  });
  
  it('Name#encode', function(){
    var name = new Packet.Name('www.google.com');
    var pattern = [ 3,'w','w','w',5,'g','o','o','g','l','e',3,'c','o','m' ];
    assert.equal(name.toBuffer().length, pattern.length);
    
  });
  
  it('Header#encode', function(){
    var header = new Packet.Header({ id: 0x2964 });
    assert.deepEqual(header.toBuffer(), new Buffer([0x29, 0x64, 0x00,0x00]));
  });
  
  it('Header#decode', function(){
    var header = Packet.Header.parse(response);
    assert.equal(header.id    , 0x2964);
    assert.equal(header.qr    , 1);
    assert.equal(header.opcode, 0);
    assert.equal(header.aa    , 0);
    assert.equal(header.tc    , 0);
    assert.equal(header.rd    , 1);
    assert.equal(header.z     , 0);
    assert.equal(header.rcode , 0);
  });
  
  it('Packet#parse', function(){
    var packet = Packet.parse(response);
    assert.equal(packet.questions[0].name , 'www.z.cn');
    assert.equal(packet.questions[0].type , Packet.TYPE.A);
    assert.equal(packet.questions[0].class, Packet.CLASS.IN);
    assert.equal(packet.answers[0].class, Packet.TYPE.A);
    assert.equal(packet.answers[0].class, Packet.CLASS.IN);
    assert.equal(packet.answers[0].host, '54.222.60.252');
  });
  
});