// Real extension UI; captured dictionary responses keep the recording repeatable.
// PLAYWRIGHT_MODULE and WORD_MEMORY_BROWSER are the same as browser-smoke.mjs.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output=process.env.WORD_MEMORY_RECORDING || path.join(os.tmpdir(),'word-memory-recording');
await fs.mkdir(output,{recursive:true});
const server=http.createServer(async(req,res)=>{
  if(req.url!=='/demo/reading.html'){res.writeHead(404).end();return;}
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end(await fs.readFile(path.join(root,'demo/reading.html')));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'word-memory-record-'));
let context;
try{
  context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,
    executablePath:process.env.WORD_MEMORY_BROWSER || undefined,
    ignoreDefaultArgs:['--disable-extensions'],
    args:['--disable-extensions-except='+path.join(root,'extension'),'--load-extension='+path.join(root,'extension')],
    viewport:{width:1100,height:1000},recordVideo:{dir:output,size:{width:1100,height:1000}}});
  const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id=worker.url().split('/')[2];
  const dictionary=JSON.parse(await fs.readFile(path.join(root,'tests/fixtures/remember-dictionary.json'),'utf8'));
  const wiktionary=JSON.parse(await fs.readFile(path.join(root,'tests/fixtures/remember-wiktionary.json'),'utf8'));
  await worker.evaluate(({dictionary,wiktionary})=>{
    globalThis.fetch=async url=>new Response(JSON.stringify(String(url).includes('dictionaryapi')?dictionary:String(url).includes('wiktionary')?wiktionary:{responseStatus:200,responseData:{translatedText:'记住'}}));
  },{dictionary,wiktionary});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const caption=async(step,text)=>page.evaluate(({step,text})=>{
    let el=document.getElementById('recording-caption');
    if(!el){el=document.createElement('div');el.id='recording-caption';el.style.cssText='position:fixed;left:0;right:0;bottom:0;height:88px;z-index:2147483647;background:#203d30;color:#fff;display:flex;align-items:center;gap:22px;padding:0 38px;box-sizing:border-box;pointer-events:none;font:22px/1.5 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;box-shadow:0 -1px 0 #ffffff20';document.body.append(el);}
    // Reserve the subtitle strip in this recording only; extension files stay unchanged.
    const host=document.querySelector('[data-word-memory]');if(host){host.style.zIndex='2147483645';host.style.maxHeight=Math.max(120,innerHeight-host.getBoundingClientRect().top-104)+'px';}
    el.replaceChildren();const label=document.createElement('span');label.style.cssText='font-size:13px;color:#c5d6b6;letter-spacing:1px;white-space:nowrap';label.textContent=step;const body=document.createElement('span');body.textContent=text;el.append(label,body);
    if(!document.getElementById('recording-cursor')){const cursor=document.createElement('div');cursor.id='recording-cursor';cursor.style.cssText='position:fixed;width:19px;height:19px;background:#ddb25475;border:2px solid #be8d2e;border-radius:50%;z-index:2147483646;pointer-events:none;transform:translate(-50%,-50%);left:-50px;top:-50px';document.body.append(cursor);document.addEventListener('mousemove',e=>{cursor.style.left=e.clientX+'px';cursor.style.top=e.clientY+'px';});}
  },{step,text});
  const pause=ms=>page.waitForTimeout(ms);
  const click=async locator=>{await locator.scrollIntoViewIfNeeded();const box=await locator.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2,{steps:14});await pause(300);await locator.click();};
  const shot=name=>page.screenshot({path:path.join(output,name+'.png')});
  await page.goto('http://127.0.0.1:'+server.address().port+'/demo/reading.html');
  await caption('词间 · WORD MEMORY','从网页里的一个词开始，让它留下来。');await pause(2500);
  const box=await page.locator('p').first().evaluate(p=>{const walker=document.createTreeWalker(p,NodeFilter.SHOW_TEXT);let n;while(n=walker.nextNode()){const i=n.textContent.indexOf('remember');if(i>=0){const r=document.createRange();r.setStart(n,i);r.setEnd(n,i+8);const b=r.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height};}}throw Error('Missing demo word');});
  await caption('01 / 网页划词','双击选中英文单词，点击「查词 ↗」。');
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2,{steps:20});await page.mouse.dblclick(box.x+box.width/2,box.y+box.height/2);await pause(1200);
  await click(page.getByRole('button',{name:'查词 ↗',exact:true}));
  await page.getByRole('heading',{name:'remember',exact:true}).waitFor();
  await page.getByRole('button',{name:'加入生词本',exact:true}).waitFor();
  await caption('02 / 查词卡','查看释义、发音，也保留你读到的原句。');await pause(3500);await shot('02-lookup');
  await page.locator('h3').filter({hasText:'02 / 词源与构词'}).evaluate(el=>{const host=document.querySelector('[data-word-memory]');host.scrollTo({top:host.scrollTop+el.getBoundingClientRect().top-host.getBoundingClientRect().top-28,behavior:'smooth'});});
  await pause(700);
  await caption('03 / 沿着词源记忆','读历史词源和构词，点击来源可继续追溯。');await pause(4500);await shot('03-etymology');
  const note=page.getByRole('textbox',{name:'我的联想 / 记忆笔记'});
  await note.scrollIntoViewIfNeeded();
  await caption('04 / 留下自己的联想','把词源和原句连起来，写下你的记忆笔记。');
  await click(note);await note.pressSequentially('memor 与 memory 相联：故事里的词，更容易记住。',{delay:50});await pause(2000);await shot('04-note');
  await click(page.getByRole('button',{name:'加入生词本',exact:true}));
  await page.getByText('已保存在本机，复习进度会保留。',{exact:true}).waitFor();
  await caption('05 / 收藏在本机','点击「加入生词本」，保存单词、原句和联想。');await pause(2200);
  await page.goto('chrome-extension://'+id+'/app.html?full=1');
  await caption('06 / 我的生词本','从扩展图标「展开窗口」，在生词本中查看收藏。');
  await click(page.getByRole('button',{name:'我的生词本',exact:true}));await pause(2200);await shot('06-library');
  await click(page.getByRole('button',{name:/remember/}));await page.locator('#detail').getByRole('textbox',{name:'我的联想 / 记忆笔记'}).waitFor();
  const result=await page.evaluate(()=>chrome.runtime.sendMessage({type:'LIST'}));
  assert.equal(result.data[0].context.sentence,'We remember a word more easily when it belongs to a story.');
  assert.match(result.data[0].note,/memor/);
  await pause(1500);
  await page.evaluate(()=>window.scrollTo(0,0));
  await click(page.getByRole('button',{name:/今日复习/}));
  await caption('07 / 先回忆，再揭晓','看到单词和原句，先想一想它是什么意思。');await pause(3500);await shot('07-recall');
  await click(page.getByRole('button',{name:'显示答案',exact:true}));
  await caption('08 / 对照答案','查看释义和自己的联想，再判断记住了多少。');
  await page.getByRole('button',{name:'记住了',exact:true}).scrollIntoViewIfNeeded();await pause(3500);await shot('08-answer');
  await click(page.getByRole('button',{name:'记住了',exact:true}));
  await page.getByText('这一轮，记住了。',{exact:true}).waitFor();
  await page.evaluate(()=>window.scrollTo(0,0));
  await caption('词间 · WORD MEMORY','查词 → 词源联想 → 收藏原句 → 间隔复习');await pause(3000);await shot('09-finish');
  assert.deepEqual(errors,[]);
  const video=page.video();await page.close();await video.saveAs(path.join(output,'word-memory-demo.webm'));
  console.log('PASS recorded real selection, etymology, note, save and review; no page errors');
  console.log(path.join(output,'word-memory-demo.webm'));
}finally{await context?.close();await new Promise(r=>server.close(r));await fs.rm(profile,{recursive:true,force:true});}
