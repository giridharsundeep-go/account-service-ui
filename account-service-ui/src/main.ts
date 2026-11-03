import {bootstrapApplication} from '@angular/platform-browser';
import {Router} from '@angular/router';
import {appConfig} from './app/app.config';import {App} from './app/app';import {SuiteAuth,defineAppMenu} from '@greatley-poshley/suite';
defineAppMenu();
async function start(){
 const original=new URL(location.href);original.searchParams.delete('sso_code');original.searchParams.delete('sso_state');let destination=original.pathname+original.search+original.hash;
 if(!/^\/(reset-password|forgot-password|super-reg|create-account)/.test(location.pathname)){
  try{const identity=new SuiteAuth('professy');let session=await identity.bootstrap();if(!session&&localStorage.getItem('token')){try{await identity.adopt(localStorage.getItem('token')!);session=(await identity.resume()).data;}catch{}}
   if(session){localStorage.setItem('token',session.token);localStorage.setItem('user',JSON.stringify(session.user));let expiry=Date.now()+86400000;try{expiry=JSON.parse(atob(session.token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).exp*1000;}catch{}localStorage.setItem('expiry',String(expiry));destination=location.pathname+location.search+location.hash;if(location.pathname==='/'||location.pathname==='/login')destination='/user-home';}
  }catch{/* Existing Professy sessions continue while the shared service is being deployed. */}
 }
 history.replaceState(null,'',original.pathname+original.search+original.hash);
 const app=await bootstrapApplication(App,appConfig);if(destination!==original.pathname+original.search+original.hash)await app.injector.get(Router).navigateByUrl(destination);
}
start().catch(console.error);
