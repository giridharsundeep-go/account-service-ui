import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {JSDOM} from 'jsdom';
import postcss from 'postcss';
const base=new URL('../../../greatley-poshley-mail-ui/src/',import.meta.url);
const source=readFileSync(new URL('mail-workflows.ts',base),'utf8');
const {DraftSaver,emptySearch,filterParams,nextSnooze}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source,{mode:'transform'})).toString('base64'));

test('autosave serializes edits made during an in-flight save',async()=>{
 const writes=[],states=[];let release;
 const saver=new DraftSaver(async value=>{writes.push(value);if(writes.length===1)await new Promise(resolve=>release=resolve);},state=>states.push(state),60000);
 const original={body:'First',recipientIds:[8]};saver.update(original);const pending=saver.flush();
 original.body='Mutation must not change snapshot';saver.update({body:'Latest',recipientIds:[8,9]});
 assert.equal(saver.hasChanges,true);assert.equal(saver.flush(),pending);release();await pending;
 assert.deepEqual(writes,[{body:'First',recipientIds:[8]},{body:'Latest',recipientIds:[8,9]}]);
 assert.equal(saver.hasChanges,false);assert.equal(states.at(-1),'saved');saver.destroy();
});

test('failed autosave keeps changes for retry instead of claiming they are saved',async()=>{
 let calls=0;const states=[];
 const saver=new DraftSaver(async()=>{if(++calls===1)throw new Error('Offline');},state=>states.push(state),60000);
 saver.update({subject:'Important'});await assert.rejects(saver.flush(),/Offline/);
 assert.equal(saver.hasChanges,true);assert.equal(states.at(-1),'error');await saver.flush();
 assert.equal(calls,2);assert.equal(saver.hasChanges,false);saver.destroy();
});

test('search filters use URL encoding and leave disabled filters out',()=>{
 assert.equal(filterParams(emptySearch()).toString(),'');
 const params=filterParams({...emptySearch(),from:'Jane & Joe',attachments:true,subject:'Release + review'},'label/1');
 assert.equal(params.get('from'),'Jane & Joe');assert.equal(params.get('subject'),'Release + review');assert.equal(params.has('starred'),false);assert.equal(params.get('label'),'label/1');
 assert.ok(params.toString().includes('Jane+%26+Joe'));
});

test('snooze durations produce an absolute UTC time across local date boundaries',()=>{
 assert.equal(nextSnooze(24,new Date('2026-11-10T23:15:00+05:30')),'2026-11-11T17:45:00.000Z');
});

test('compose stays in-page with subject and chip recipients before the borderless body',()=>{
 const template=readFileSync(new URL('app.html',base),'utf8');const dom=new JSDOM(template);const root=dom.window.document;
 const compose=root.querySelector('.post-compose');assert.ok(compose);assert.equal(compose.closest('.mail-layout'),root.querySelector('.mail-layout'));
 assert.equal(compose.tagName,'SECTION');assert.equal(root.querySelector('.inbox-heading'),null);
 const order=[...compose.querySelector('.post-compose-scroll').children].map(el=>el.className);
 assert.deepEqual(order.slice(0,4),['post-compose-subject','recipient-fields','post-compose-hint','post-compose-editor']);
 assert.ok(compose.querySelector('.address-chip'));assert.ok(compose.querySelector('.address-options[role=listbox]'));
 assert.equal(compose.querySelector('.post-compose-footer').lastElementChild.classList.contains('post-send-button'),true);
 assert.ok(compose.querySelector('input[type=file][multiple]'));dom.window.close();
});

test('borderless compose and subject underline styles match actual nodes',()=>{
 const index=readFileSync(new URL('index.html',base),'utf8');const dom=new JSDOM(index);dom.window.document.querySelector('app-root').innerHTML=readFileSync(new URL('app.html',base),'utf8');
 const css=postcss.parse(readFileSync(new URL('inbox.css',base),'utf8'));
 for(const selector of [':root #gp-app .post-inbox .post-compose-subject>input',':root #gp-app .post-inbox .post-compose .address-entry>input',':root #gp-app .post-inbox .post-compose .post-send-button']){
  assert.ok(dom.window.document.querySelector(selector),selector);let rule;css.walkRules(value=>{if(value.selector===selector)rule=value;});assert.ok(rule,selector);
 }
 dom.window.close();
});
