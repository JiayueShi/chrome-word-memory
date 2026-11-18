import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'word-memory-ipa-'));
const server=http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','text/html;charset=utf-8');
  res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'unsafe-inline'; font-src 'none'");
  res.end(await fs.readFile(path.join(root,'demo/reading.html')));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let context;
try{
  context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,executablePath:process.env.WORD_MEMORY_BROWSER || undefined,
    ignoreDefaultArgs:['--disable-extensions'],args:['--disable-extensions-except='+path.join(root,'extension'),'--load-extension='+path.join(root,'extension')],viewport:{width:1100,height:1000},deviceScaleFactor:2});
  const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');const id=worker.url().split('/')[2];
  const dictionary=JSON.parse(await fs.readFile(path.join(root,'tests/fixtures/general-dictionary.json')));
  await worker.evaluate(data=>{globalThis.fetch=async url=>new Response(JSON.stringify(String(url).includes('dictionaryapi')?data:{}));},dictionary);
  async function verify(page){
    await page.locator('.wm-phonetic').waitFor();
    assert.equal(await page.locator('.wm-phonetic').textContent(),'/ˈd͡ʒɛnɹəl/');
    await page.waitForFunction(()=>Array.from(document.fonts).some(f=>f.family==='WordMemoryIPA' && f.status==='loaded'),null,{timeout:5000});
    const cdp=await context.newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');
    const {root}=await cdp.send('DOM.getDocument',{depth:-1,pierce:true});
    function find(node){if(node.attributes?.includes('wm-phonetic'))return node;for(const child of [...(node.children || []),...(node.shadowRoots || [])]){const match=find(child);if(match)return match;}}
    const node=find(root);const {fonts}=await cdp.send('CSS.getPlatformFontsForNode',{nodeId:node.nodeId});
    assert.ok(fonts.some(f=>f.isCustomFont && f.familyName==='Noto Sans' && f.glyphCount>=11),'IPA must render with bundled glyphs');
    await cdp.detach();return fonts;
  }
  const page=await context.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
  await page.locator('p').first().evaluate(p=>{p.textContent='A general idea connects many details.';const r=document.createRange();r.setStart(p.firstChild,2);r.setEnd(p.firstChild,9);const s=getSelection();s.removeAllRanges();s.addRange(r);p.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,button:0}));});
  await page.getByRole('button',{name:'查词 ↗',exact:true}).click();await verify(page);
  await page.locator('.wm-phonetic').screenshot({path:path.join(os.tmpdir(),'word-memory-general-ipa.png')});
  console.log('PASS general IPA uses bundled glyphs despite page font-src none');
  await context.setOffline(true);
  const app=await context.newPage();await app.goto('chrome-extension://'+id+'/app.html?full=1');
  await app.locator('#word-input').fill('general');await app.getByRole('button',{name:'查词 ↗',exact:true}).click();await verify(app);
  console.log('PASS fresh offline card loads local IPA font and preserves stress, tie bar and IPA letters');
}finally{await context?.close();await new Promise(r=>server.close(r));await fs.rm(profile,{recursive:true,force:true});}
