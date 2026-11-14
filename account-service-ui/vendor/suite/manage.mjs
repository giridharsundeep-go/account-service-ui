#!/usr/bin/env node
import {spawn,execFileSync} from 'node:child_process';
import {connect} from 'node:net';
import {mkdir,readFile,writeFile,open,unlink,chmod,stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {appRegistry} from './index.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const suiteRuntime=resolve(root,'greatley-poshley-suite/.runtime');
const runtime=resolve(suiteRuntime,'ui');
const backendRuntime=resolve(suiteRuntime,'services');
const instruSecrets=resolve(suiteRuntime,'secrets/instru-local.env');
const backendTargets=[
  {name:'Professy',radarName:'Astra core',dir:'professy-backend/professy',port:8080,keyLabel:'ASTRA_CORE',jar:'build/libs/professy-0.0.1-SNAPSHOT.jar',config:'core.properties'},
  {name:'Hello',radarName:'Hello API',dir:'chatly-service',port:8084,keyLabel:'HELLO_API',jar:'build/libs/chatly-service-0.1.0.jar',config:'chatly-service.properties'},
  {name:'Hello realtime',radarName:'Hello realtime',dir:'chatly-realtime-service',port:8085,keyLabel:'HELLO_REALTIME',jar:'build/libs/chatly-realtime-service-0.1.0.jar',config:'chatly-realtime-service.properties'},
  {name:'Passport',radarName:'Passport',dir:'greatley-poshley-auth-service',port:8086,keyLabel:'PASSPORT',jar:'build/libs/greatley-poshley-auth-service-0.1.0.jar',config:'greatley-poshley-auth-service.properties'},
  {name:'Paper',radarName:'Paper',dir:'greatley-poshley-docs-service',port:8087,keyLabel:'PAPER',jar:'build/libs/greatley-poshley-docs-service-0.1.0.jar',config:'greatley-poshley-docs-service.properties'},
  {name:'Agenda',radarName:'Agenda',dir:'greatley-poshley-calendar-service',port:8088,keyLabel:'AGENDA',jar:'build/libs/greatley-poshley-calendar-service-0.1.0.jar',config:'greatley-poshley-calendar-service.properties'},
  {name:'Columns',radarName:'Columns',dir:'greatley-poshley-sheets-service',port:8089,keyLabel:'COLUMNS',jar:'build/libs/greatley-poshley-sheets-service-0.1.0.jar',config:'core.properties'},
  {name:'Show',radarName:'Show',dir:'greatley-poshley-slides-service',port:8090,keyLabel:'SHOW',jar:'build/libs/greatley-poshley-slides-service-0.1.0.jar',config:'core.properties'},
  {name:'Room',radarName:'Room',dir:'greatley-poshley-meetings-service',port:8091,keyLabel:'ROOM',jar:'build/libs/greatley-poshley-meetings-service-0.1.0.jar',config:'core.properties'},
  {name:'Post',radarName:'Post',dir:'greatley-poshley-mail-service',port:8095,keyLabel:'POST',jar:'build/libs/greatley-poshley-mail-service-0.1.0.jar',config:'mail.properties'},
  {name:'Email',radarName:'Email',dir:'professy-email-service',port:8083,keyLabel:'EMAIL',jar:'build/libs/professy-email-service-1.0.0.jar',config:'email.properties'},
  {name:'Notifications',radarName:'Notifications',dir:'professy-notification-service',port:8082,keyLabel:'NOTIFICATIONS',jar:'build/libs/professy-notification-service-1.0.0.jar',config:'notification.properties'},
  {name:'Radar',radarName:'Radar',dir:'greatley-poshley-instru-service',port:8094,keyLabel:'RADAR',jar:'build/libs/greatley-poshley-instru-service-0.1.0.jar',config:'instru.properties'}
];
const launchTargets=[
  {alias:'Astra',dir:'account-service-ui/account-service-ui',port:4200},
  {alias:'Relay',dir:'chatly-ui',port:4201},
  {alias:'Folio',dir:'greatley-poshley-docs-ui',port:4202},
  {alias:'Tempo',dir:'greatley-poshley-calendar-ui',port:4203},
  {alias:'Access',dir:'greatley-poshley-auth-ui',port:4204},
  {alias:'Grid',dir:'greatley-poshley-sheets-ui',port:4205},
  {alias:'Prism',dir:'greatley-poshley-slides-ui',port:4206},
  {alias:'Gather',dir:'greatley-poshley-meetings-ui',port:4207},
  {alias:'Forge',dir:'greatley-poshley-forge-ui',port:4208},
  {alias:'Instru',dir:'greatley-poshley-instru-ui',port:4209},
  {alias:'Post',dir:'greatley-poshley-mail-ui',port:4210},
  {alias:'Desk',dir:'greatley-poshley-support-ui',port:4211}
];
const apps=appRegistry(true).map(product=>{
  const target=launchTargets.find(candidate=>candidate.port===product.port);
  return {...product,...target};
});
const command=process.argv[2]||'status';
const selected=process.argv[3];
const selection=selected?.toLowerCase();
const matchesSelection=app=>[app.name?.toLowerCase(),app.alias?.toLowerCase(),app.radarName?.toLowerCase(),String(app.port)].includes(selection);
if(selection&&![...apps,...backendTargets].some(matchesSelection)){console.error('Unknown app or service: '+selected);process.exit(1);}
if(!['start','status','stop','restart'].includes(command)){
  console.error('Usage: node manage.mjs start|status|stop|restart [app-name-or-port]');process.exit(1);
}
function listeningOn(host,port){return new Promise(resolve=>{
  const socket=connect({host,port});
  const done=value=>{socket.destroy();resolve(value);};
  socket.setTimeout(500);socket.once('connect',()=>done(true));socket.once('error',()=>done(false));socket.once('timeout',()=>done(false));
});}
async function runningHost(port){
  for(const host of ['localhost','127.0.0.1'])if(await listeningOn(host,port))return host;
  return null;
}
async function loadInstruKeys(){
  try{
    const info=await stat(instruSecrets);
    if((info.mode&0o077)!==0)throw new Error('Local Radar key file must have mode 600.');
    const rows=await readFile(instruSecrets,'utf8');
    const keys=new Map();
    for(const line of rows.split(/\r?\n/)){
      const match=line.match(/^INSTRU_([A-Z0-9_]+)_KEY=(gpi_[A-Za-z0-9_-]{24,160})$/);
      if(match)keys.set(match[1],match[2]);
    }
    return keys;
  }catch(error){
    console.error('Local Radar keys unavailable: '+error.message);
    return new Map();
  }
}
async function startBackend(service,keys){
  const host=await runningHost(service.port);
  const pidFile=resolve(backendRuntime,service.port+'.json');
  if(host){
    let owned=false;
    try{const state=JSON.parse(await readFile(pidFile,'utf8'));owned=state.dir===service.dir&&state.telemetry===true&&state.pid>0;}catch{}
    console.log(service.name+' API: '+(owned?'running with Radar telemetry':'already running at http://'+host+':'+service.port+'; left untouched'));
    return;
  }
  const key=keys.get(service.keyLabel);
  if(!key){console.error(service.name+' API: missing local Radar key '+service.keyLabel);process.exitCode=1;return;}
  const cwd=resolve(root,service.dir),jar=resolve(cwd,service.jar);
  if(!existsSync(jar)){console.error(service.name+' API: build missing at '+jar);process.exitCode=1;return;}
  const logFile=resolve(backendRuntime,service.port+'.log');
  const log=await open(logFile,'a',0o600);
  const instance=service.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'-local';
  const args=['-jar',jar,'--server.port='+service.port];
  if(service.config){
    const config=resolve(process.env.HOME||'/Users/giridharsundeep','.config/professy',service.config);
    args.push('--spring.config.additional-location=optional:file:'+config);
  }
  const child=spawn('/usr/bin/java',args,{
    cwd,detached:true,stdio:['ignore',log.fd,log.fd],
    env:{...process.env,INSTRU_ENDPOINT:'http://127.0.0.1:8094',INSTRU_KEY:key,INSTRU_VERSION:process.env.INSTRU_VERSION||'local',INSTRU_INSTANCE_ID:instance}
  });
  await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
  await writeFile(pidFile,JSON.stringify({pid:child.pid,dir:service.dir,jar,telemetry:true}),{mode:0o600});
  await chmod(pidFile,0o600);
  child.unref();await log.close();
  console.log(service.name+' API: starting with Radar telemetry at http://localhost:'+service.port+' (log: '+logFile+')');
}
async function stopBackend(service){
  const pidFile=resolve(backendRuntime,service.port+'.json');
  try{
    const owned=JSON.parse(await readFile(pidFile,'utf8'));
    if(owned.dir!==service.dir||owned.telemetry!==true)throw new Error('Unknown process');
    process.kill(-owned.pid,'SIGTERM');await unlink(pidFile);
    console.log(service.name+' API: stopped this launcher’s instrumented process.');
  }catch{console.log(service.name+' API: no launcher-owned instrumented process to stop.');}
}
async function restartBackend(service,keys){
  const host=await runningHost(service.port);
  if(host){
    let pids=[];
    try{pids=execFileSync('lsof',['-tiTCP:'+service.port,'-sTCP:LISTEN'],{encoding:'utf8'}).trim().split(/\s+/).filter(Boolean);}catch{}
    if(!pids.length){console.error(service.name+' API: cannot safely identify the listener on port '+service.port);process.exitCode=1;return;}
    for(const rawPid of pids){
      const pid=Number(rawPid);
      let commandLine='',workingDirectory='',processName='';
      try{processName=execFileSync('ps',['-p',String(pid),'-o','comm='],{encoding:'utf8'}).trim();}catch{}
      try{commandLine=execFileSync('ps',['-p',String(pid),'-o','args='],{encoding:'utf8'}).trim();}catch{}
      try{workingDirectory=execFileSync('lsof',['-a','-p',String(pid),'-d','cwd','-Fn'],{encoding:'utf8'});}catch{}
      let previous={};
      try{previous=JSON.parse(await readFile(resolve(backendRuntime,service.port+'.json'),'utf8'));}catch{}
      const belongs=previous.dir===service.dir||commandLine.includes(service.dir)||workingDirectory.includes('/'+service.dir);
      if(!processName.toLowerCase().includes('java')||!belongs){
        console.error(service.name+' API: port '+service.port+' is occupied by a process that does not match this service; left untouched.');
        process.exitCode=1;return;
      }
      try{process.kill(pid,'SIGTERM');}catch(error){if(error.code!=='ESRCH')throw error;}
    }
    for(let attempt=0;attempt<40&&await runningHost(service.port);attempt++)await new Promise(resolve=>setTimeout(resolve,250));
    if(await runningHost(service.port)){console.error(service.name+' API: existing JVM did not release port '+service.port);process.exitCode=1;return;}
  }
  await startBackend(service,keys);
}
await mkdir(runtime,{recursive:true,mode:0o700});
await mkdir(backendRuntime,{recursive:true,mode:0o700});
for(const app of (command==='restart'?[]:apps.filter(app=>selection?matchesSelection(app):command!=='start'||!app.hidden))){
  const pidFile=resolve(runtime,app.port+'.json'),logFile=resolve(runtime,app.port+'.log');
  if(command==='stop'){
    try{
      const owned=JSON.parse(await readFile(pidFile,'utf8'));
      if(owned.dir!==app.dir)throw new Error('Unknown process');
      process.kill(-owned.pid,'SIGTERM');await unlink(pidFile);
      console.log(app.name+': stopped this launcher’s UI process.');
    }catch{console.log(app.name+': no launcher-owned process to stop.');}
    continue;
  }
  const host=await runningHost(app.port);
  if(host){console.log(app.name+': running at http://'+host+':'+app.port);continue;}
  if(command==='status'){console.log(app.name+': not running on port '+app.port);continue;}
  const cwd=resolve(root,app.dir),cli=resolve(cwd,'node_modules/@angular/cli/bin/ng.js');
  if(!existsSync(cli)){console.error(app.name+': run npm ci in '+cwd);process.exitCode=1;continue;}
  const log=await open(logFile,'a',0o600);
  const child=spawn(process.execPath,[cli,'serve','--host','localhost','--port',String(app.port),'--no-open'],{
    cwd,detached:true,stdio:['ignore',log.fd,log.fd],env:{...process.env,NG_CLI_ANALYTICS:'false',NG_BUILD_MAX_WORKERS:process.env.NG_BUILD_MAX_WORKERS||'2',NG_BUILD_PARALLEL_TS:process.env.NG_BUILD_PARALLEL_TS||'0'}
  });
  await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
  await writeFile(pidFile,JSON.stringify({pid:child.pid,dir:app.dir}),{mode:0o600});
  await chmod(pidFile,0o600);
  child.unref();await log.close();
  console.log(app.name+': starting at http://localhost:'+app.port+' (log: '+logFile+')');
}
const selectedBackends=backendTargets.filter(service=>selection?matchesSelection(service):true);
if(command==='stop'){
  for(const service of selectedBackends)await stopBackend(service);
}else if(command==='restart'){
  const keys=await loadInstruKeys();
  for(const service of selectedBackends)await restartBackend(service,keys);
  console.log('Restarted selected Java APIs with per-service Radar telemetry.');
}else if(command==='status'){ 
  for(const service of selectedBackends){
    const host=await runningHost(service.port);
    let owned=false;
    try{const state=JSON.parse(await readFile(resolve(backendRuntime,service.port+'.json'),'utf8'));owned=state.dir===service.dir&&state.telemetry===true;}catch{}
    console.log(service.name+' API: '+(host?(owned?'running with Radar telemetry':'running; external process left untouched'):'not running on port '+service.port));
  }
}else if(command==='start'){
  const keys=await loadInstruKeys();
  for(const service of selectedBackends)await startBackend(service,keys);
  console.log('Run status to check readiness. Existing UI and API servers are left running; missing Java APIs start with local Radar telemetry.');
}
