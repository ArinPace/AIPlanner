// Isolated loopback fixture for the native testTaskControlWidgetFlow. No account access.
import http from 'node:http'
let feedback=null,deliveries=0
const server=http.createServer(async(req,res)=>{
 res.setHeader('Content-Type','application/json')
 if(req.url==='/status'){res.end(JSON.stringify(feedback?{...feedback,deliveries}:null));return}
 if(req.url==='/api/widget/snapshot'){res.writeHead(404);res.end('{}');return}
 if(req.url==='/api/widget/feedback'&&req.method==='POST'&&req.headers.authorization==='Bearer fixture-session'){
  const chunks=[];for await(const chunk of req)chunks.push(chunk)
  deliveries++;feedback=JSON.parse(Buffer.concat(chunks));res.writeHead(202);res.end('{"ok":true}');return
 }
 res.writeHead(403);res.end('{}')
})
server.listen(5199,'127.0.0.1')
