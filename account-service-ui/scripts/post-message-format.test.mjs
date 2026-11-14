import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {JSDOM} from 'jsdom';

globalThis.DOMParser=new JSDOM('').window.DOMParser;
const source=readFileSync(new URL('../../../greatley-poshley-mail-ui/src/message-format.ts',import.meta.url),'utf8');
const code=stripTypeScriptTypes(source);
const {messageBodyHtml,encodeMessageBody,messageBodyText,cleanMessageMarkup}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));

test('legacy messages remain plain text, including HTML-looking content',()=>{
  assert.equal(messageBodyHtml('Hello <b>team</b> & all\nNext'),'Hello &lt;b&gt;team&lt;/b&gt; &amp; all<br>Next');
  assert.equal(messageBodyText('Legacy plain\ntext'),'Legacy plain\ntext');
  assert.equal(messageBodyHtml(null),'');
});

test('formatted drafts preserve emphasis, colors and lists through storage',()=>{
  const rich=encodeMessageBody('<p><b>Hello</b> <span style="color:#1558d6">team</span></p><ul><li>One</li><li>Two</li></ul>');
  assert.match(messageBodyHtml(rich),/<b>Hello<\/b>/);
  assert.match(messageBodyHtml(rich),/color: rgb\(21, 88, 214\)/);
  assert.equal(messageBodyText(rich),'Hello team\nOne\nTwo');
  assert.equal(cleanMessageMarkup('<font color="#18864b" face="fake">Green</font>'),'<span style="color: rgb(24, 134, 75);">Green</span>');
});

test('rich messages discard executable HTML, links and unapproved styles',()=>{
  const hostile=cleanMessageMarkup('<p onclick="alert(1)" style="background:url(javascript:x);color:red">Safe<script>alert(1)</script><img src=x onerror=alert(1)><svg onload=alert(1)>bad</svg><a href="javascript:alert(1)">link</a></p>');
  const doc=new DOMParser().parseFromString(hostile,'text/html');
  assert.equal(doc.body.textContent,'Safelink');
  assert.equal(doc.querySelector('script,img,svg,a[href],[onclick],[onerror],[onload]'),null);
  assert.ok(!hostile.includes('javascript:'));
  assert.ok(!hostile.includes('background'));
});

test('inbox previews and replies contain readable text instead of rich markup',()=>{
  assert.equal(messageBodyText('<div data-post-body="rich"><p><b>Hello'),'Hello');
  assert.equal(messageBodyText(encodeMessageBody('<p>&lt;script&gt; &amp; quotes</p>')),'<script> & quotes');
});
