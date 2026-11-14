import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire,stripTypeScriptTypes} from 'node:module';

const relay=new URL('../../../chatly-ui/',import.meta.url);
const require=createRequire(new URL('package.json',relay));
const ts=require('typescript');
function compile(name,globals={}){
 const source=readFileSync(new URL('src/'+name,relay),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};
 new Function('require','module','exports',...Object.keys(globals),code)(require,module,module.exports,...Object.values(globals));
 return module.exports;
}
const windowSource=readFileSync(new URL('src/message-window.ts',relay),'utf8');
const {messageWindow}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(windowSource,{mode:'transform'})).toString('base64'));
const rows=(start,count)=>Array.from({length:count},(_,i)=>({id:start+i,body:'message '+(start+i)}));

test('live windows deduplicate updates and remain capped during large catch-up',()=>{
 const next=messageWindow(rows(1,200),[...rows(180,250),{id:420,body:'edited'},{id:NaN},{id:-1}]);
 assert.equal(next.length,200);assert.equal(next[0].id,230);assert.equal(next.at(-1).id,429);
 assert.equal(next.find(r=>r.id===420).body,'edited');
});
test('history paging preserves the oldest page and ignores new messages while reading it',()=>{
 const older=messageWindow(rows(101,200),rows(51,50),'older');
 assert.equal(older.length,200);assert.equal(older[0].id,51);assert.equal(older.at(-1).id,250);
 const refreshed=messageWindow(older,[{id:100,body:'edited'},...rows(1000,50)],'history');
 assert.equal(refreshed.find(r=>r.id===100).body,'edited');assert.equal(refreshed.at(-1).id,250);
});
const {formatChatMessage,isInCodeFence}=compile('chat-code-format.ts');
test('Unicode prose is preserved; arbitrary HTML in code is escaped',()=>{
 const prose='नमस्ते தமிழ் తెలుగు 中文 日本語 한국어 العربية עברית Français Русский';
 const blocks=formatChatMessage(prose+'\n```unknown-language\n<script>alert("x")</script>\n```');
 assert.equal(blocks[0].parts[0].text,prose);
 assert.ok(blocks[1].html.includes('&lt;script&gt;'));assert.ok(!blocks[1].html.includes('<script>'));
 assert.equal(isInCodeFence('```rust\nfn main() {}'),true);
 assert.equal(isInCodeFence('```rust\nfn main() {}\n```'),false);
});
test('large code blocks fall back to escaped text',()=>{
 const code='<script>'+('x'.repeat(21000))+'</script>';
 const block=formatChatMessage('```java\n'+code+'\n```')[0];
 assert.equal(block.source,code);assert.ok(!block.html.includes('<script>'));assert.ok(!block.html.includes('hljs-'));
});
test('background worker supports broad grammars and safely handles unknown syntax',()=>{
 let callback,result;
 compile('code-worker.ts',{addEventListener:(event,fn)=>callback=fn,postMessage:value=>result=value});
 for(const [language,source] of [['rust','fn main() { let ready = true; }'],['kotlin','data class Review(val ready: Boolean)'],['c#','public record Release(string Version);']]){
  callback({data:{id:1,body:{blocks:[{kind:'code',language,source,html:source}]}}});
  assert.ok(result.blocks[0].html.includes('hljs-'),language);
 }
 callback({data:{id:2,body:{blocks:[{kind:'code',language:'xml',source:'<script>alert(1)</script>',html:''}]}}});
 assert.ok(!result.blocks[0].html.includes('<script>'));
 callback({data:{id:3,body:{blocks:[{kind:'code',language:'unsupported',source:'anything',html:'escaped fallback'}]}}});
 assert.equal(result.blocks[0].html,'escaped fallback');
 assert.ok(require('highlight.js').listLanguages().length>=190);
});
