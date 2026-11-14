import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const require=createRequire(import.meta.url);
const {JSDOM}=require('jsdom');
const postcss=require('postcss');
const root=fileURLToPath(new URL('../',import.meta.url));
const projects=path.resolve(root,'../..');
const design=path.join(projects,'greatley-poshley-design-system');
const apps=[['professy',root],...[
 ['chatly','chatly-ui'],['documents','greatley-poshley-docs-ui'],['calendar','greatley-poshley-calendar-ui'],
 ['identity','greatley-poshley-auth-ui'],['sheets','greatley-poshley-sheets-ui'],['slides','greatley-poshley-slides-ui'],
 ['meetings','greatley-poshley-meetings-ui'],['forge','greatley-poshley-forge-ui'],['instru','greatley-poshley-instru-ui'],
 ['mail','greatley-poshley-mail-ui'],['support','greatley-poshley-support-ui']].map(([id,folder])=>[id,path.join(projects,folder)])];
const read=p=>readFileSync(p,'utf8');
const css=postcss.parse(read(path.join(design,'clean.css')));
const dom=new JSDOM('<!doctype html><html data-gp-layout="clean"><body></body></html>',{url:'http://localhost:4200/'});
for(const name of ['window','document','HTMLElement','customElements','location','CustomEvent','localStorage','sessionStorage'])globalThis[name]=dom.window[name];
globalThis.innerWidth=1280;
globalThis.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
dom.window.matchMedia=globalThis.matchMedia;
const {cleanVisualStyles}=await import('../../../greatley-poshley-suite/clean-visual-system.js');
const {defineWorkspaceShell}=await import('../../../greatley-poshley-suite/workspace-shell.js');
const {appRegistry,appLogo}=await import('../../../greatley-poshley-suite/index.js');
defineWorkspaceShell();

test('eleven apps import clean styles through the existing watched stylesheet; Post is excluded',()=>{
 for(const [id,folder] of apps){
  const index=read(path.join(folder,'src/index.html'));
  const config=JSON.parse(read(path.join(folder,'angular.json')));
  const styles=Object.values(config.projects)[0].architect.build.options.styles;
  assert.equal(index.includes('data-gp-layout="clean"'),id!=='mail',id);
  assert.ok(!styles.includes('node_modules/@greatley-poshley/design-system/clean.css'),'No separate style entry that requires a server restart');
  assert.ok(styles.includes('src/styles.css'),id);
  const imports=postcss.parse(read(path.join(folder,'src/styles.css'))).nodes.filter(n=>n.type==='atrule'&&n.name==='import');
  if(id!=='mail')assert.equal(imports[0].params,"'@greatley-poshley/design-system/clean.css'",id);
  else {
   assert.ok(!imports.some(n=>n.params.includes('/clean.css')),id);
   assert.ok(imports.some(n=>n.params.includes('/fonts.css')),'Post uses shared typography without changing its layout');
  }
 }
});

test('new global layout rules require explicit opt-in, including dark mode',()=>{
 let checked=0;
 css.walkRules(rule=>{
  if(rule.parent.type==='atrule'&&rule.parent.name==='keyframes')return;
  assert.ok(rule.selector.startsWith(':root[data-gp-layout="clean"]'),rule.selector);
  checked++;
 });
 assert.ok(checked>40);
 for(const surface of ['workspace','launcher','people','theme']){
  assert.ok(cleanVisualStyles(surface,'chatly').length>0,surface);
  assert.equal(cleanVisualStyles(surface,'mail'),'');
 }
 document.documentElement.removeAttribute('data-gp-layout');
 try{assert.equal(cleanVisualStyles('workspace','chatly'),'');}finally{document.documentElement.dataset.gpLayout='clean';}
});

test('UI typography changes preserve authored fonts, code, and icon glyphs',()=>{
 let selector='';
 css.walkRules(rule=>{if(rule.selector.includes(':where(body,body *)'))selector=rule.selector;});
 assert.ok(selector);
 const fixture=document.createElement('div');
 fixture.innerHTML='<h2 id="title">Project</h2><button id="action">Create</button><input id="search"><span class="material-icons" id="icon">search</span><code id="code">const n = 1;</code><pre><span id="code-child">code</span></pre><article class="document-paper"><h1 id="doc">Document</h1></article><table class="sheet-grid"><tbody><tr><td id="cell">Sheet</td></tr></tbody></table><div class="slide-page"><div id="slide">Slide</div></div><div class="present-slide"><div id="present">Presentation</div></div><p style="font-family:Georgia"><strong id="chosen-font">Chosen font</strong></p>';
 document.body.append(fixture);
 for(const id of ['title','action','search'])assert.ok(fixture.querySelector('#'+id).matches(selector),id);
 for(const id of ['icon','code','code-child','doc','cell','slide','present','chosen-font'])assert.ok(!fixture.querySelector('#'+id).matches(selector),id);
 fixture.remove();
});

test('UI table normalization does not match document, workbook, or slide tables',()=>{
 const selectors=[];
 css.walkRules(rule=>{if(rule.selector.includes('.mat-mdc-table'))selectors.push(rule.selector);});
 const fixture=document.createElement('div');
 fixture.innerHTML='<table class="users-table"><tbody><tr><td id="user-cell">Alex</td></tr></tbody></table><article class="document-paper"><table><tbody><tr><td id="doc-cell">Authored table</td></tr></tbody></table></article><table class="sheet-grid"><tbody><tr><td id="sheet-cell">25</td></tr></tbody></table><div class="slide-page"><table><tbody><tr><td id="slide-cell">50</td></tr></tbody></table></div>';
 document.body.append(fixture);
 assert.ok(selectors.some(s=>fixture.querySelector('#user-cell').matches(s)));
 for(const id of ['doc-cell','sheet-cell','slide-cell'])assert.ok(selectors.every(s=>!fixture.querySelector('#'+id).matches(s)),id);
 fixture.remove();
});

test('main header identifies each product with its canonical logo and name',()=>{
 for(const app of appRegistry()){
  const shell=document.createElement('gp-workspace-shell');shell.setAttribute('current',app.id);document.body.append(shell);
  const brand=shell.shadowRoot.querySelector('.brand gp-brand');
  assert.equal(brand.getAttribute('app'),app.id);
  assert.equal(brand.shadowRoot.querySelector('.name').textContent,app.name);
  assert.equal(brand.shadowRoot.querySelector('img').getAttribute('src'),appLogo(app.id));
  assert.equal(shell.shadowRoot.querySelector('.brand').getAttribute('aria-label'),app.name+' home');
  assert.equal(shell.shadowRoot.querySelector('.product-label'),null,'No duplicate app label');
  shell.remove();
 }
});

test('the font kit has local regular/italic faces, variable weights and license assets',()=>{
 const faces=postcss.parse(read(path.join(design,'fonts.css')));
 const styles=[];
 faces.walkAtRules('font-face',face=>{
  const props=Object.fromEntries(face.nodes.filter(n=>n.type==='decl').map(d=>[d.prop,d.value]));
  assert.equal(props['font-family'],'"Poshley Sans"');assert.equal(props['font-weight'],'400 700');
  assert.equal(props['font-display'],'swap');assert.ok(!props.src.includes('http'));
  const local=props.src.match(/url\("([^"\n]+)"\)/)[1];assert.ok(existsSync(path.join(design,local)));styles.push(props['font-style']);
 });
 assert.deepEqual(styles.sort(),['italic','italic','normal','normal']);
 const kit=path.join(design,'fonts/poshley-sans');const manifest=JSON.parse(read(path.join(kit,'manifest.json')));
 for(const [name,meta] of Object.entries(manifest.outputs)){
  const bytes=readFileSync(path.join(kit,name));assert.equal(createHash('sha256').update(bytes).digest('hex'),meta.sha256,name);
  assert.ok(meta.characters>=(name.includes('-Latin.')?200:3000),name);
 }
 assert.ok(read(path.join(kit,'OFL.txt')).includes('SIL OPEN FONT LICENSE Version 1.1'));
 for(const [id,folder] of apps){const config=JSON.parse(read(path.join(folder,'angular.json')));assert.ok(Object.values(config.projects)[0].architect.build.options.assets.some(a=>a.glob==='OFL.txt'&&a.output==='assets/fonts/poshley-sans'),id);}
});

test('Access uses the company wordmark and the same white split auth layout',()=>{
 const source=read(path.join(projects,'greatley-poshley-auth-ui/src/app.html'));
 const auth=new JSDOM(source).window.document;
 const header=auth.querySelector('.gp-auth-header');
 assert.equal(header.children.length,1);
 assert.ok(header.querySelector('gp-brand[name="Greatley Poshley"]:not([icon-only]):not([app])'));
 assert.ok(auth.querySelector('.gp-auth-footer').textContent.includes('Greatley Poshley Ltd.'));
 assert.equal(header.querySelector('gp-apps,button,input'),null);
 assert.ok(auth.querySelector('.gp-auth-split>.gp-auth-gallery'));
 assert.ok(auth.querySelector('.gp-auth-split>.gp-auth-form-pane form'));
 assert.equal(auth.querySelector('gp-workspace-shell'),null,'Sign-in has no workspace navigation');
 const authCss=postcss.parse(read(path.join(design,'auth.css')));
 let desktopSplit=false,mobileSplit=false;
 authCss.walkDecls('grid-template-columns',decl=>{
  if(!decl.parent.selector.includes('.gp-auth-split'))return;
  if(decl.value==='minmax(0,1fr) minmax(0,1fr)')desktopSplit=true;
  if(decl.parent.parent.params==='(max-width:800px)'&&decl.value==='minmax(0,1fr)')mobileSplit=true;
 });
 assert.ok(desktopSplit,'Equal-width desktop halves');assert.ok(mobileSplit,'Single-column mobile layout');
});

test('the app gallery registry is safe when prerendering without browser globals',async()=>{
 const {execFileSync}=await import('node:child_process');
 const module=new URL('../../../greatley-poshley-suite/index.js',import.meta.url).href;
 const result=execFileSync(process.execPath,['--input-type=module','-e',`const {appRegistry}=await import(${JSON.stringify(module)});process.stdout.write(String(appRegistry().length));`],{encoding:'utf8'});
 assert.equal(result,'12');
});
