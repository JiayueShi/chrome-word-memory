import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server=http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'unsafe-inline'; media-src 'none'");
  res.end(await fs.readFile(path.join(root,'demo/reading.html')));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'word-memory-speech-'));
let context;
try{
  context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,executablePath:process.env.WORD_MEMORY_BROWSER || undefined,
    ignoreDefaultArgs:['--disable-extensions'],args:['--disable-extensions-except='+path.join(root,'extension'),'--load-extension='+path.join(root,'extension')],viewport:{width:1200,height:1000}});
  const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id=worker.url().split('/')[2];
  const dictionary=JSON.parse(await fs.readFile(path.join(root,'tests/fixtures/remember-dictionary.json')));
  const wiktionary=JSON.parse(await fs.readFile(path.join(root,'tests/fixtures/remember-wiktionary.json')));
  await worker.evaluate(({dictionary,wiktionary})=>{
    globalThis.fetch=async url=>new Response(JSON.stringify(String(url).includes('dictionaryapi')?dictionary:String(url).includes('wiktionary')?wiktionary:{}));
    globalThis.speechEvents=[];
    const original=chrome.tts.speak.bind(chrome.tts);
    chrome.tts.speak=(word,options,callback)=>original(word,{...options,onEvent:event=>{
      speechEvents.push({word,type:event.type,error:event.errorMessage});options.onEvent(event);
    }},callback);
  },{dictionary,wiktionary});
  const page=await context.newPage();const errors=[];const media=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.resourceType()==='media')media.push(r.url());});
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.locator('p').first().evaluate(p=>{const r=document.createRange();r.setStart(p.firstChild,3);r.setEnd(p.firstChild,11);const s=getSelection();s.removeAllRanges();s.addRange(r);p.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,button:0}));});
  await page.getByRole('button',{name:'查词 ↗',exact:true}).click();
  await page.getByRole('button',{name:'加入生词本',exact:true}).waitFor();
  await page.getByRole('button',{name:'加入生词本',exact:true}).click();
  await page.getByText('已保存在本机，复习进度会保留。',{exact:true}).waitFor();
  const speak=async scope=>{
    await scope.getByRole('button',{name:'▶ 发音',exact:true}).click();
    await scope.getByText(/播放完成 · 系统.*发音。/).waitFor({timeout:12000});
    const events=await worker.evaluate(()=>speechEvents.splice(0));
    assert.ok(events.some(e=>e.word==='remember' && e.type==='start'),'Native synthesis never started');
    assert.ok(events.some(e=>e.word==='remember' && e.type==='end'),'Native synthesis never completed');
    assert.ok(!events.some(e=>e.type==='error'),JSON.stringify(events));
    assert.equal(await scope.getByRole('button',{name:'▶ 发音',exact:true}).isEnabled(),true);
  };
  await context.setOffline(true);await speak(page);
  assert.deepEqual(media,[],'Pronunciation should not fetch webpage audio');
  const voices=await worker.evaluate(()=>new Promise(resolve=>chrome.tts.getVoices(v=>resolve(v.filter(v=>!v.remote && /^en[-_]/i.test(v.lang))))));
  assert.ok(voices.length,'Install a local English voice to run native speech verification');
  console.log('PASS native English voice:',voices.find(v=>v.voiceName==='Samantha')?.voiceName || voices[0].voiceName);
  console.log('PASS webpage pronunciation offline with media-src none; real native start/end events');
  const app=await context.newPage();app.on('pageerror',e=>errors.push(e.message));await app.goto('chrome-extension://'+id+'/app.html?full=1');
  await app.getByRole('button',{name:'我的生词本',exact:true}).click();await app.getByRole('button',{name:/remember/}).click();
  await speak(app.locator('#detail'));
  console.log('PASS offline saved-word pronunciation');
  await app.getByRole('button',{name:/今日复习/}).click();await speak(app.locator('#review'));
  assert.equal(await app.getByRole('button',{name:'显示答案',exact:true}).isVisible(),true,'Listening must not reveal the answer');
  console.log('PASS offline review pronunciation before revealing answer');
  await context.setOffline(false);
  await worker.evaluate(()=>{chrome.tts.getVoices=callback=>callback([]);});
  await app.locator('#review').getByRole('button',{name:'▶ 发音',exact:true}).click();
  await app.locator('#review').getByText(/未找到本机英语语音/).waitFor();
  assert.equal(await app.locator('#review').getByRole('button',{name:'▶ 发音',exact:true}).isEnabled(),true);
  assert.deepEqual(errors,[]);
  console.log('PASS actionable missing-voice error, retry enabled, no browser page errors');
}finally{await context?.close();await new Promise(r=>server.close(r));await fs.rm(profile,{recursive:true,force:true});}
