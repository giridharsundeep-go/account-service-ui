import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';

const source=readFileSync(new URL('../../../greatley-poshley-mail-ui/src/mail-pagination.ts',import.meta.url),'utf8');
const {MailPagination}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source,{mode:'transform'})).toString('base64'));

test('cursor pages move forward and back without concatenating mailbox rows',()=>{
 const pager=new MailPagination();
 const first=pager.request('inbox');assert.deepEqual(first,{context:'inbox',index:0,before:0});
 pager.commit(first,40,161);
 assert.equal(pager.range,'1–40');assert.equal(pager.hasPrevious,false);assert.equal(pager.hasNext,true);
 const second=pager.request('inbox',1);assert.equal(second.before,161);
 pager.commit(second,40,121);
 assert.equal(pager.range,'41–80');assert.equal(pager.hasPrevious,true);
 const third=pager.request('inbox',2);assert.equal(third.before,121);
 pager.commit(third,8,0);
 assert.equal(pager.range,'81–88');assert.equal(pager.hasNext,false);
 assert.equal(pager.request('inbox',1).before,161);
 assert.throws(()=>pager.request('inbox',3),RangeError);
});

test('refreshes retain the page while filter, folder and search changes restart pagination',()=>{
 const pager=new MailPagination();
 pager.commit(pager.request('folder=inbox'),40,99);
 pager.commit(pager.request('folder=inbox',1),40,59);
 assert.equal(pager.request('folder=inbox').before,99);
 assert.equal(pager.request('folder=inbox').index,1);
 for(const context of ['folder=sent','folder=inbox&q=release','folder=inbox&from=Jane','folder=inbox&unread=true']){
  assert.deepEqual(pager.request(context),{context,index:0,before:0});
 }
 pager.commit(pager.request('folder=inbox&q=release'),2,0);
 assert.equal(pager.range,'1–2');assert.equal(pager.hasPrevious,false);assert.equal(pager.hasNext,false);
 assert.throws(()=>pager.request('folder=inbox&q=release',1),RangeError);
});

test('a failed page request leaves the displayed range and retry cursor intact',()=>{
 const pager=new MailPagination();pager.commit(pager.request('inbox'),40,80);
 const failedRequest=pager.request('inbox',1);
 // The caller reports its fetch error without committing the unsuccessful response.
 assert.equal(pager.pageIndex,0);assert.equal(pager.range,'1–40');
 assert.deepEqual(pager.request('inbox',1),failedRequest);
 pager.commit(failedRequest,5,0);
 assert.equal(pager.range,'41–45');assert.equal(pager.hasNext,false);
});

test('an empty final page can fall back to the previous cursor after deletions',()=>{
 const pager=new MailPagination();pager.commit(pager.request('inbox'),40,80);
 pager.commit(pager.request('inbox',1),1,0);
 const emptyPage=pager.request('inbox');
 const fallback=pager.request(emptyPage.context,emptyPage.index-1);
 pager.commit(fallback,40,0);
 assert.equal(pager.range,'1–40');assert.equal(pager.hasPrevious,false);assert.equal(pager.hasNext,false);
});
