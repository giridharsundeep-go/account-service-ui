import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {JSDOM} from 'jsdom';
import postcss from 'postcss';

const source=readFileSync(new URL('../../../greatley-poshley-mail-ui/src/inbox-layout.ts',import.meta.url),'utf8');
const {groupInbox,messageDate,messagePosition}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
const now=new Date(2026,10,12,12);
const message=(id,sender,day,extra={})=>({id,sender_id:sender,sender_name:'Person '+sender,status:'SENT',sent_at:`2026-11-${day}T10:00:00`,subject:'Message '+id,read_at:null,...extra});

test('mail is grouped by local dates and remains in chronological order',()=>{
  const groups=groupInbox([message(1,1,'01'),message(2,2,'10'),message(3,3,'11'),message(4,4,'12')],true,now);
  assert.deepEqual(groups.map(g=>g.label),['Today','Yesterday','This week','This month']);
  assert.deepEqual(groups.map(g=>g.entries[0].latest.id),[4,3,2,1]);
});

test('same-sender bundles stay within date sections and retain every message',()=>{
  const groups=groupInbox([message(1,7,'12'),message(2,7,'12',{sent_at:'2026-11-12T11:00:00',read_at:'2026-11-12T11:01:00'}),message(3,7,'11')],true,now);
  const bundle=groups[0].entries[0];
  assert.equal(bundle.bundled,true);
  assert.deepEqual(bundle.messages.map(m=>m.id),[2,1]);
  assert.equal(bundle.unread,1);
  assert.equal(groups[1].entries[0].bundled,false);
  assert.equal(groups.reduce((total,g)=>total+g.count,0),3);
});

test('turning grouping off exposes individual messages without losing rows',()=>{
  const groups=groupInbox([message(1,7,'12'),message(2,7,'12')],false,now);
  assert.equal(groups[0].entries.length,2);
  assert.ok(groups[0].entries.every(e=>!e.bundled));
});

test('pagination overlap, missing dates and anonymous senders are handled safely',()=>{
  const input=[message(1,0,'12',{sender_name:''}),message(2,0,'12',{sender_name:''}),message(1,0,'12'),message(3,1,'12',{sent_at:'not-a-date'})];
  const groups=groupInbox(input,true,now);
  assert.equal(groups.reduce((total,g)=>total+g.count,0),3);
  assert.equal(groups[0].entries.length,2);
  assert.equal(groups.at(-1).label,'Other messages');
  assert.equal(messageDate(input.at(-1)),null);
});

test('drafts use their edited date and never collapse into sender bundles',()=>{
  const groups=groupInbox([message(1,1,'01',{status:'DRAFT',updated_at:'2026-11-12 09:00:00'}),message(2,1,'01',{status:'DRAFT',updated_at:'2026-11-12 11:00:00'})],true,now);
  assert.equal(groups[0].label,'Today');
  assert.equal(groups[0].entries.length,2);
  assert.equal(groups[0].entries.reduce((n,e)=>n+e.unread,0),0);
});

test('sender bundles do not mutate the API response',()=>{
  const items=[message(1,7,'11'),message(2,7,'12')];
  const before=JSON.stringify(items);
  groupInbox(items,true,now);
  assert.equal(JSON.stringify(items),before);
});

test('mailbox layout selectors match the actual bootstrap document and Angular template',()=>{
  const index=readFileSync(new URL('../../../greatley-poshley-mail-ui/src/index.html',import.meta.url),'utf8');
  const template=readFileSync(new URL('../../../greatley-poshley-mail-ui/src/app.html',import.meta.url),'utf8');
  const css=postcss.parse(readFileSync(new URL('../../../greatley-poshley-mail-ui/src/inbox.css',import.meta.url),'utf8'));
  const page=new JSDOM(index);
  page.window.document.querySelector('app-root').innerHTML=template;
  // Check the real document, not an invented fixture with a convenient root ID.
  for(const className of ['post-inbox','inbox-message','inbox-toolbar','inbox-reader-title','inbox-reader-sender','post-app-rail']){
    let selector='';
    css.walkRules(rule=>{if(rule.selector===`:root #gp-app .post-inbox${className==='post-inbox'?'':' .'+className}`)selector=rule.selector;});
    assert.ok(selector,'Missing layout contract for '+className);
    assert.ok(page.window.document.querySelector(selector),'Layout selector does not match the application: '+selector);
  }
  page.window.close();
});

test('reader navigation stops at loaded mailbox boundaries and accepts API string IDs',()=>{
  const items=[message(9,1,'12'),message(8,2,'11'),message(7,3,'10')];
  assert.deepEqual(messagePosition(items,'9'),{index:0,total:3,hasPrevious:false,hasNext:true});
  assert.deepEqual(messagePosition(items,8),{index:1,total:3,hasPrevious:true,hasNext:true});
  assert.deepEqual(messagePosition(items,7),{index:2,total:3,hasPrevious:true,hasNext:false});
});

test('direct-linked or removed messages do not navigate to unrelated mailbox rows',()=>{
  const items=[message(1,1,'12')];
  for(const id of [undefined,null,NaN,0,'invalid',999])assert.deepEqual(messagePosition(items,id),{index:-1,total:1,hasPrevious:false,hasNext:false});
  assert.deepEqual(messagePosition([],1),{index:-1,total:0,hasPrevious:false,hasNext:false});
});

const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost:4210/'});
for(const name of ['window','document','HTMLElement','customElements','location','CustomEvent','localStorage','sessionStorage'])globalThis[name]=dom.window[name];
globalThis.innerWidth=1280;
globalThis.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
dom.window.matchMedia=globalThis.matchMedia;
const {defineWorkspaceShell}=await import('../../../greatley-poshley-suite/workspace-shell.js');
const {mailVisualStyles}=await import('../../../greatley-poshley-suite/mail-visual-system.js');
const {cleanVisualStyles}=await import('../../../greatley-poshley-suite/clean-visual-system.js');
defineWorkspaceShell();

test('Post mail navigation and search state stay isolated from other products',()=>{
  const post=document.createElement('gp-workspace-shell');post.setAttribute('current','mail');post.setAttribute('mail-layout','inbox');post.setAttribute('header-layout','relay');document.body.append(post);
  assert.equal(post.shadowRoot.querySelector('[data-page="starred"]').textContent.trim(),'Starred');
  assert.equal(post.shadowRoot.querySelector('[data-page="archive"]').textContent.trim(),'Archive');
  assert.ok(post.shadowRoot.querySelector('gp-apps').hasAttribute('shared-chrome'));
  const relayChrome=cleanVisualStyles('workspace','chatly',{sharedChrome:true});
  assert.ok(relayChrome.length>0);
  assert.ok(post.shadowRoot.querySelector('style').textContent.includes(relayChrome),'Post must use the shared Relay chrome');
  let compose=0;post.addEventListener('gp-create',()=>compose++);
  post.shadowRoot.querySelector('.nav-create').click();
  assert.equal(compose,1);
  post.setAttribute('search-value','Roadmap');
  assert.equal(post.shadowRoot.querySelector('.header-search input').value,'Roadmap');
  post.setAttribute('search-value','');
  assert.equal(post.shadowRoot.querySelector('.header-search input').value,'');
  post.remove();
  const relay=document.createElement('gp-workspace-shell');relay.setAttribute('current','chatly');document.body.append(relay);
  assert.equal(relay.shadowRoot.querySelector('[data-page="starred"]'),null);
  assert.ok(!relay.shadowRoot.querySelector('gp-apps').hasAttribute('icon-only'));
  assert.ok(!relay.shadowRoot.querySelector('style').textContent.includes('mail-layout="inbox"'));
  relay.remove();
});

test('all Post header rules are explicitly scoped to its Inbox layout',()=>{
  const css=postcss.parse(mailVisualStyles);
  css.walkRules(rule=>{assert.ok(rule.selector.includes('[current="mail"][mail-layout="inbox"]'),rule.selector);});
});
