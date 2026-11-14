import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../package.json',import.meta.url));
const {JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><body></body>',{url:'http://localhost:4200'});
for(const name of ['window','document','HTMLElement','customElements','location','CustomEvent'])globalThis[name]=dom.window[name];
const {definePeopleCard,actorKind}=await import('../../../greatley-poshley-suite/people-card.js');
const {appRegistry}=await import('../../../greatley-poshley-suite/index.js');
definePeopleCard();
test('suite distinguishes real actor types rather than names',()=>{assert.equal(actorKind(4,'AGENT'),'AGENT');assert.equal(actorKind(-4),'AGENT');assert.equal(actorKind(4),'HUMAN');assert.equal(actorKind(null),'UNASSIGNED');});
test('the same people card presents human and robot identity accessibly',()=>{const card=document.createElement('gp-person-card');card.person={id:4,name:'Alex',actorType:'AGENT',designation:'Quality reviewer'};document.body.append(card);const icon=card.shadowRoot.querySelector('gp-actor-icon');assert.equal(icon.getAttribute('aria-label'),'Agent');assert.ok(icon.shadowRoot.querySelector('rect'));card.person={id:4,name:'Alex',actorType:'HUMAN',designation:'Engineer'};assert.equal(card.shadowRoot.querySelector('gp-actor-icon').getAttribute('aria-label'),'Human');card.remove();});
test('all twelve product entries have distinct icons and local addresses',()=>{const apps=appRegistry();assert.equal(apps.length,12);assert.equal(new Set(apps.map(a=>a.icon)).size,12);assert.deepEqual(apps.map(a=>a.port).sort(),[4200,4200,4201,4202,4203,4204,4205,4206,4207,4209,4210,4211]);assert.ok(apps.every(a=>a.url.startsWith('http://localhost:')));assert.equal(apps.find(a=>a.id==='people').port,apps.find(a=>a.id==='professy').port);assert.equal(appRegistry(true).find(a=>a.id==='forge').port,4208);});

test('profile details button does not toggle card selection',()=>{const card=document.createElement('gp-person-card');card.person={id:8,name:'Alex',email:'alex@example.test',designation:'Engineer'};card.selectable=true;document.body.append(card);let selections=0;card.addEventListener('gp-person-select',()=>selections++);const button=card.shadowRoot.querySelector('.details-button');button.click();assert.equal(selections,0);assert.equal(button.getAttribute('aria-expanded'),'true');assert.equal(card.shadowRoot.querySelector('.person-details').hidden,false);card.shadowRoot.querySelector('.close-details').click();assert.equal(card.shadowRoot.querySelector('.person-details').hidden,true);card.remove();});
