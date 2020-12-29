const http = require('http');
const https = require('https');
const fs = require('fs');
const url = require('url');
const EventEmitter = require("events");
const Packet = require('../packet');
  
class Server extends EventEmitter {
    constructor(options) {
        super();

        // Set defaults and then check what the cat brought in
        var port = 80
        var sslport = 443;
        var cert = '';
        var key = '';
        if (typeof options === 'object') {
            if (options.http) port = options.port;
            if (options.sslport) sslport = options.sslport;
            if (options.cert) cert = options.cert;
            if (options.key) key = options.key;
        }

        //If no cert or key specified make a futile atempt of reading default names
        if (cert=='') cert = fs.readFileSync(path.join(__dirname,"server.crt"));
        if (key=='') key = fs.readFileSync(path.join(__dirname,"secret.key"));

        // if http port is specified create http server. However DoH needs SSL so a proxy must be infront.
        if (port!=0)
            var httpOptions = {                    
            };
            var httpServer = http.createServer(httpOptions).listen(port, function(){
                this.emit('listening', "http", port);
            });    
            httpServer.on("request", this.handleRequest.bind(this)) 

        // if SSL-port, key and cert is specified then create an SSL endpoint
        if (sslport!=0&&key!=''&&cert!='')
            var httpsOptions = {
                key: key,
                cert: cert
            };
            var httpsServer = https.createServer(httpsOptions).listen(sslport, function(){
                this.emit('listening', "https", sslport);
            });   
            httpsServer.on("request", this.handleRequest.bind(this)) 
    };

    handleRequest(req,res) {
            
        // We are only handling get and post as reqired by rfc
        const method = req.method;            
        if ((method!="GET" && method!="POST")) {
            res.writeHead(405, {"Content-Type": "text/plain"});
            res.write("405 Method not allowed\n");
            res.end();
            return;
        }
    
        // Check so the uri is correct
        const uri = url.parse(req.url).pathname;
        if (uri!="/dns-query") {
            res.writeHead(404, {"Content-Type": "text/plain"});
            res.write("404 Not Found\n");
            res.end();
            return;
        }
        
        // Make sure the requestee is requesting the correct content type
        const contentType = req.headers['accept'];
        if (contentType!="application/dns-message") {
            res.writeHead(400, {"Content-Type": "text/plain"});
            res.write("400 Bad Request: Illegal content type\n");
            res.end();
            return;
        }
    
        var queryData = {};
    
        if (method == 'GET') {
            //Parse query string for the request data
            const queryObject = url.parse(req.url,true).query;
            if (!queryObject.dns) {
                res.writeHead(400, {"Content-Type": "text/plain"});
                res.write("400 Bad Request: No query defined\n");
                res.end();
                return;
            }
            
            //Decode from Base64Url Encoding
            var queryData = queryObject.dns.replace(/-/g, '+').replace(/_/g, '/');
            var pad = queryData.length % 4;
            if(pad) {
                if(pad === 1) {
                    res.writeHead(400, {"Content-Type": "text/plain"});
                    res.write("400 Bad Request: Invalid query data\n");
                    res.end();
                    return;
                }
                queryData += new Array(5-pad).join('=');
            }

            //Decode Base64 to buffer
            queryData = Buffer.from(queryData, 'base64');
            const message = Packet.parse(queryData);
    
            //Raise event
            this.emit('request', message, this.response.bind(this, res), req);
    
        } else {
    
            // Collect request from client and..
            collectRequestData.then((request)=>{
                const message = Packet.parse(request);
    
                //then raise the event
                this.emit('request', message, this.response.bind(this, res), req);    
            });
        }
        
    }; 

    // Send of the response to the client
    response(res, message) {
        res.setHeader('Content-Type', 'application/dns-message');
        res.writeHead(200);
        res.end(message.toBuffer());
    };

    // Wait for the request body to be received
    async collectRequestData(request) {
        let body = '';
        request.on('data', chunk => {
            body += chunk;
        });
        request.on('end', () => {
            callback(body);
        });
    };

}

module.exports = Server;