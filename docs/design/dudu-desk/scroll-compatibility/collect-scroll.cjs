const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const trace=path.join(__dirname,'scroll.ndjson');
http.createServer((request,response)=>{
  response.setHeader('Access-Control-Allow-Origin','http://localhost:1423');
  if(request.url==='/probe.js'){
    response.setHeader('Content-Type','text/javascript');
    response.end(fs.readFileSync(path.join(__dirname,'scroll-probe.js')));return;
  }
  if(request.method==='POST'&&request.url==='/events'){
    let body='';request.on('data',chunk=>body+=chunk);
    request.on('end',()=>{
      try{const events=JSON.parse(body);fs.appendFileSync(trace,events.map(event=>JSON.stringify(event)).join('\n')+'\n');
        const notable=events.filter(event=>event.type!=='frame');
        if(notable.length)console.log(JSON.stringify(notable));
        response.end('ok');
      }catch{response.statusCode=400;response.end();}
    });return;
  }
  response.statusCode=404;response.end();
}).listen(9435,'127.0.0.1',()=>console.log('Scroll collector ready on 9435'));
