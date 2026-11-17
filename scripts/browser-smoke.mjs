import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server=http.createServer(async(req,res)=>{
  const name=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!name.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{const data=await fs.readFile(name);res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html; charset=utf-8');res.end(data);}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'word-memory-browser-'));
let context;
try{
  context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,executablePath:process.env.WORD_MEMORY_BROWSER || undefined,ignoreDefaultArgs:['--disable-extensions'],args:['--disable-extensions-except='+path.join(root,'extension'),'--load-extension='+path.join(root,'extension')],viewport:{width:1200,height:900}});
  const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker',{timeout:15000});
  const id=worker.url().split('/')[2];console.log('PASS extension registered:',id);
  const fixtureDictionary=JSON.parse(await fs.readFile(path.join(root,'tests/fixtures/remember-dictionary.json'),'utf8'));
  const fixtureWiktionary=JSON.parse(await fs.readFile(path.join(root,'tests/fixtures/remember-wiktionary.json'),'utf8'));
  const useFixtures=async()=>worker.evaluate(({dictionary,wiktionary})=>{globalThis.fetch=async url=>new Response(JSON.stringify(String(url).includes('dictionaryapi')?dictionary:String(url).includes('wiktionary')?wiktionary:{responseStatus:200,responseData:{translatedText:'记住'}}));},{dictionary:fixtureDictionary,wiktionary:fixtureWiktionary});
  if(process.env.WORD_MEMORY_LIVE!=='1')await useFixtures();

  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/demo/reading.html');
  async function select(word){
    await page.locator('p').first().evaluate((p,word)=>{const walker=document.createTreeWalker(p,NodeFilter.SHOW_TEXT);let n;while(n=walker.nextNode()){const i=n.textContent.toLowerCase().indexOf(word);if(i>=0){const range=document.createRange();range.setStart(n,i);range.setEnd(n,i+word.length);const s=getSelection();s.removeAllRanges();s.addRange(range);p.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,button:0}));return;}}throw new Error('word not in fixture');},word);
    await page.getByRole('button',{name:'查词 ↗',exact:true}).click();
    await page.getByRole('heading',{name:word,exact:true}).waitFor();
  }
  await select('remember');
  const save=page.getByRole('button',{name:'加入生词本',exact:true});await save.click({timeout:40000});
  await page.getByText('已保存在本机，复习进度会保留。',{exact:true}).waitFor();
  const app=await context.newPage();app.on('pageerror',e=>errors.push(e.message));await app.goto('chrome-extension://'+id+'/app.html?full=1');
  const send=async msg=>{const r=await app.evaluate(message=>chrome.runtime.sendMessage(message),msg);assert.equal(r.ok,true,r.error);return r.data;};
  const [record]=await send({type:'LIST'});assert.equal(record.word,'remember');assert.equal(record.context.sentence,'We remember a word more easily when it belongs to a story.');
  assert.ok(record.lookup.meanings.length,'Live dictionary meanings missing');assert.match(record.lookup.etymology,/remembren/,'Live Wiktionary missing');assert.ok(record.lookup.translation.includes('記住'),'Mandarin term missing');
  console.log('PASS '+(process.env.WORD_MEMORY_LIVE==='1'?'live-source':'fixture-backed')+' webpage selection, dictionary, etymology, Mandarin, local save');
  await page.keyboard.press('Escape');assert.equal(await page.locator('[data-word-memory]').count(),0);
  await worker.evaluate(({dictionary,wiktionary})=>{globalThis.fetch=async url=>new Response(JSON.stringify(String(url).includes('dictionaryapi')?dictionary:String(url).includes('wiktionary')?wiktionary:{responseStatus:200,responseData:{translatedText:'记住'}}));},{dictionary:fixtureDictionary,wiktionary:fixtureWiktionary});
  await app.locator('#word-input').fill('remember');await app.getByRole('button',{name:'查词 ↗',exact:true}).click();
  await app.getByRole('button',{name:'翻译首条释义',exact:true}).click();
  await app.locator('#lookup-card').getByText('自动翻译，仅供参考',{exact:true}).waitFor({timeout:3000});
  await app.getByRole('button',{name:'加入生词本',exact:true}).click();await app.getByText('已保存在本机，复习进度会保留。',{exact:true}).waitFor();
  await app.getByRole('button',{name:'我的生词本',exact:true}).click();await app.getByRole('button',{name:/remember/}).click();
  await app.locator('#detail').getByText('自动翻译，仅供参考',{exact:true}).waitFor({timeout:3000});
  console.log('PASS automatic translation provenance remains after saving and reopening');
  await app.getByRole('button',{name:'查一个词',exact:true}).click();
  await send({type:'EDIT',word:'remember',patch:{note:'My original mnemonic',translation:'我自己的释义'}});
  await send({type:'RATE',word:'remember',grade:'remembered'});
  const before=(await send({type:'LIST'}))[0];
  await app.locator('#word-input').fill('remember');await app.getByRole('button',{name:'查词 ↗',exact:true}).click();
  await app.getByRole('button',{name:'加入生词本',exact:true}).click();await app.getByText('已保存在本机，复习进度会保留。',{exact:true}).waitFor();
  const after=(await send({type:'LIST'}))[0];assert.equal(after.note,'My original mnemonic','Fresh lookup erased saved note');assert.equal(after.translation,'我自己的释义','Fresh lookup erased personal meaning');assert.equal(after.dueAt,before.dueAt);
  console.log('PASS repeated UI save preserves personal notes, meaning and review');
  await app.screenshot({path:path.join(root,'dist/word-memory-preview.png'),fullPage:true});
  await app.reload();await app.getByRole('button',{name:'我的生词本',exact:true}).click();await app.getByRole('button',{name:/remember.*我自己的释义/}).click();
  assert.equal(await app.getByRole('textbox',{name:'我的联想 / 记忆笔记'}).inputValue(),'My original mnemonic');
  await app.getByRole('textbox',{name:'我的联想 / 记忆笔记'}).fill('New personal mnemonic');await app.getByRole('button',{name:'保存修改',exact:true}).click();await app.getByText('已保存在本机，复习进度会保留。',{exact:true}).waitFor();assert.equal((await send({type:'LIST'}))[0].note,'New personal mnemonic');
  console.log('PASS reopen vocabulary and edit notes');
  await send({type:'RATE',word:'remember',grade:'forgotten'});
  const backup=await send({type:'EXPORT'});backup.words[0].dueAt=1;backup.words[0].word='memory';backup.words[0].lookup.word='memory';backup.words[0].context.sentence='<img src=x onerror=alert(1)> memory';backup.words[0].context.url='javascript:alert(1)';backup.words[0].note='<script>alert(1)</script>';
  const imported=await send({type:'IMPORT',backup});assert.equal(imported.added,1);assert.equal((await send({type:'LIST'})).length,2);
  await app.getByRole('button',{name:/今日复习/}).click();assert.equal(await app.getByRole('button',{name:'记住了',exact:true}).count(),0);await app.getByRole('button',{name:'显示答案',exact:true}).click();
  assert.equal(await app.locator('#review img, #review script').count(),0);assert.equal(await app.locator('#review a[href^="javascript:"]').count(),0);
  await app.getByRole('button',{name:'记住了',exact:true}).click();await app.getByText('这一轮，记住了。',{exact:true}).waitFor();
  const memory=(await send({type:'LIST'})).find(r=>r.word==='memory');assert.ok(memory.dueAt>Date.now());
  console.log('PASS safe imported text and active-recall rating persists');
  const raceBackup=await send({type:'EXPORT'});
  const base=raceBackup.words.find(r=>r.word==='memory');
  raceBackup.words=['origin','curiosity'].map((word,index)=>({...base,word,lookup:{...base.lookup,word},dueAt:index+1}));
  await send({type:'IMPORT',backup:raceBackup});
  await app.evaluate(()=>{const original=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=async message=>{const result=await original(message);if(message.type==='RATE'){window.__ratingPending=true;await new Promise(r=>setTimeout(r,1800));window.__ratingPending=false;}return result;};});
  await app.getByRole('button',{name:/今日复习/}).click();
  await app.getByRole('button',{name:'显示答案',exact:true}).click();
  await app.getByRole('button',{name:'记住了',exact:true}).click();
  await app.waitForFunction(()=>window.__ratingPending===true);
  await app.getByRole('button',{name:'查一个词',exact:true}).click();
  await app.getByRole('button',{name:/今日复习/}).click();
  await app.waitForFunction(()=>window.__ratingPending===false);await app.waitForTimeout(400);
  assert.equal(await app.getByRole('heading',{name:'curiosity',exact:true}).count(),1,'Late grade skipped a word in the new review session');
  console.log('PASS late rating cannot skip a word after navigating away and back');

  const offlineWords=await send({type:'LIST'});
  await worker.evaluate(async()=>{await chrome.storage.local.remove('wordMemoryCache');globalThis.fetch=async()=>{throw new TypeError('offline');};});
  await app.getByRole('button',{name:'查一个词',exact:true}).click();await app.locator('#word-input').fill('remember');await app.getByRole('button',{name:'查词 ↗',exact:true}).click();await app.getByText('网络不可用，显示本地生词本内容。',{exact:true}).waitFor();assert.equal((await send({type:'LIST'})).length,offlineWords.length);
  console.log('PASS offline saved-word lookup');
  // A late query must not bring back a dismissed or replaced page card.
  await worker.evaluate(()=>{globalThis.fetch=async()=>{await new Promise(r=>setTimeout(r,400));throw new TypeError('offline');};});
  await page.reload();await select('memory');await page.keyboard.press('Escape');await page.waitForTimeout(1200);assert.equal(await page.locator('[data-word-memory]').count(),0);
  await select('remember');await select('memory');await page.waitForTimeout(1200);assert.equal(await page.getByRole('heading',{name:'memory',exact:true}).count(),1);assert.equal(await page.getByRole('heading',{name:'remember',exact:true}).count(),0);
  console.log('PASS dismiss and rapid selection stale-result isolation');
  await page.keyboard.press('Escape');
  await page.locator('p').first().evaluate(p=>{p.textContent='Remember the first. I remember the second.';const i=p.textContent.lastIndexOf('remember');const range=document.createRange();range.setStart(p.firstChild,i);range.setEnd(p.firstChild,i+8);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);p.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,button:0}));});
  await page.getByRole('button',{name:'查词 ↗',exact:true}).click();
  await page.getByText('I remember the second.',{exact:true}).waitFor({timeout:3000});
  console.log('PASS context belongs to the actual selected occurrence of a repeated word');
  assert.deepEqual(errors,[]);console.log('PASS no browser page errors');
}finally{
  await context?.close();await new Promise(r=>server.close(r));await fs.rm(profile,{recursive:true,force:true});
}
