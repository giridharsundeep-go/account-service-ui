let initialized=false;

/** Keep suite chrome on the shared light console palette across every app. */
export function applyTheme(){
  if(typeof document==='undefined')return;
  document.documentElement.dataset.theme='light';
  document.documentElement.style.colorScheme='light';
  document.dispatchEvent(new CustomEvent('gp-theme-change',{detail:'light'}));
}

/** Retain the existing API while enforcing the suite-wide white surface. */
export function setTheme(){
  try{
    localStorage.setItem('gp.workspace.theme','light');
    document.cookie='gp_theme=light; Path=/; Max-Age=31536000; SameSite=Lax';
  }catch{}
  applyTheme();
}

export function defineTheme(){
  if(typeof window==='undefined'||initialized)return;
  initialized=true;
  applyTheme();
  window.addEventListener('storage',event=>{if(event.key==='gp.workspace.theme')applyTheme();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)applyTheme();});
}
