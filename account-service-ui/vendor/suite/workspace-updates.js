/** Subscribe using the current access token; reconnection picks up token refresh and revoked sessions. */
export function subscribeWorkspace(token, receive) {
 let stopped=false,controller,timer;
 async function connect(){
  if(stopped)return;controller=new AbortController();
  try{
   const value=token();if(!value)return;
   const response=await fetch(`${location.protocol}//${location.hostname}:8080/api/workspace/settings/events`,{headers:{Authorization:'Bearer '+value,Accept:'text/event-stream'},signal:controller.signal});
   if(!response.ok||!response.body)throw new Error('Workspace updates unavailable');
   const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
   while(!stopped){const chunk=await reader.read();if(chunk.done)break;buffer+=decoder.decode(chunk.value,{stream:true}).replace(/\r\n/g,'\n');let end;while((end=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);if(!/^event:\s*workspace$/m.test(frame))continue;const data=frame.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');try{await receive(JSON.parse(data));}catch(error){console.error('Workspace update failed:',error);}}}
  }catch(error){if(error.name!=='AbortError'){} }
  finally{if(!stopped)timer=setTimeout(connect,3000);}
 }
 void connect();return ()=>{stopped=true;controller?.abort();clearTimeout(timer);};
}
