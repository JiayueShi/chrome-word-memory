import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseWiktionary,parseKaikki,lookupDictionary,lookupEtymology,translateText} from '../extension/dictionary.js';
const fixture=name=>JSON.parse(fs.readFileSync(new URL(`./fixtures/remember-${name}.json`,import.meta.url)));

// Catch mixing other languages and losing nested template terms in actual source data.
test('real Wiktionary fixture yields English origin, root and Mandarin translations',()=>{
 const r=parseWiktionary(fixture('wiktionary').parse.wikitext['*'],'remember');
 assert.match(r.etymology,/remembren/);
 assert.match(r.etymology,/Latin/);
 assert.ok(r.roots.some(root=>root.includes('*(s)mer-')));
 assert.ok(r.translations.includes('記住'));
 assert.ok(!r.etymology.includes('{{'));
});

test('English language boundary excludes foreign-language etymologies and translations',()=>{
 const text='==French==\n===Etymology===\nWrong French origin.\n==English==\n===Etymology===\nFrom {{der|en|la|{{m|la|memor}}||mindful}}.\n===Translations===\n{{t|cmn|記住}}\n==German==\n===Etymology===\nWrong German origin.\n{{t|cmn|错误}}';
 const r=parseWiktionary(text,'remember');
 assert.match(r.etymology,/Latin memor/);
 assert.ok(!r.etymology.includes('Wrong'));
 assert.deepEqual(r.translations,['記住']);
 assert.equal(parseWiktionary('==French==\n===Etymology===\nWrong','remember').etymology,'');
});

test('no etymology means no fabricated spelling-based root',()=>{
 const r=parseWiktionary('==English==\n===Noun===\n# Something.','butterfly');
 assert.equal(r.etymology,'');assert.deepEqual(r.roots,[]);
});

test('dictionary response preserves definition and filters unsafe pronunciation URL',async()=>{
 const r=await lookupDictionary('remember',async()=>new Response(JSON.stringify(fixture('dictionary'))));
 assert.match(r.meanings[0].definitions[0].definition,/recall/);
 assert.match(r.audio,/^https:/);
 const unsafe=[{word:'remember',phonetics:[{audio:'javascript:alert(1)'}],meanings:[{partOfSpeech:'verb',definitions:[{definition:'To recall.'}]}]}];
 assert.equal((await lookupDictionary('remember',async()=>new Response(JSON.stringify(unsafe)))).audio,'');
});

test('unavailable and malformed services reject clearly, never as success',async()=>{
 await assert.rejects(()=>lookupDictionary('remember',async()=>new Response('{}')));
 await assert.rejects(()=>lookupDictionary('remember',async()=>new Response('{}',{status:404})));
 await assert.rejects(()=>lookupEtymology('remember',async()=>new Response('{"error":{"code":"missingtitle"}}')));
 await assert.rejects(()=>lookupDictionary('remember',async()=>{throw new TypeError('offline')}));
});

test('translation respects quota and preserves source text as plain text',async()=>{
 assert.equal(await translateText('To recall.',async()=>new Response(JSON.stringify({responseStatus:200,responseData:{translatedText:'回忆'}}))),'回忆');
 await assert.rejects(()=>translateText('To recall.',async()=>new Response(JSON.stringify({responseStatus:200,quotaFinished:true,responseData:{translatedText:'quota exhausted'}}))));
 await assert.rejects(()=>translateText('x'.repeat(501),async()=>new Response('{}')));
});

test('explicitly unrelated English mentions do not become cognate suggestions',()=>{
 const r=parseWiktionary('==English==\n===Etymology===\nUnrelated to {{m|en|female}}. Cognate with {{cog|en|memory}}.','male');
 assert.ok(!r.related.includes('female'));
 assert.ok(r.related.includes('memory'));
});

test('multiple etymologies label the branch for each root, avoiding false common-sense decomposition',()=>{
 const r=parseWiktionary(fixture('wiktionary').parse.wikitext['*'],'remember');
 assert.ok(r.roots.some(x=>x.startsWith('词源 2 · ') && x.includes('re- + member')));
 assert.ok(r.roots.some(x=>x.startsWith('词源 1 · ') && x.includes('*(s)mer-')));
});


test('Kaikki mirror preserves English etymology branches and Mandarin translations',()=>{
 const text=fs.readFileSync(new URL('./fixtures/remember-kaikki.jsonl',import.meta.url),'utf8');
 const r=parseKaikki(text,'remember');
 assert.match(r.etymology,/remembren/);assert.ok(r.roots.some(x=>x.startsWith('词源 2 · ') && x.includes('re- + member')));
 assert.ok(r.translations.some(x=>x.includes('记住')));
 assert.equal(parseKaikki(JSON.stringify({word:'remember',lang_code:'fr',etymology_text:'wrong'}),'remember').etymology,'');
});

test('working Wiktionary mirror supplies etymology when original API is unavailable',async()=>{
 const text=fs.readFileSync(new URL('./fixtures/remember-kaikki.jsonl',import.meta.url),'utf8');
 const r=await lookupEtymology('remember',async url=>String(url).includes('en.wiktionary.org')?new Response('{}',{status:503}):new Response(text));
 assert.match(r.etymology,/remembren/);assert.ok(r.sources.some(s=>s.name.includes('Kaikki')));
});
