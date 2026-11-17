import test from 'node:test';
import assert from 'node:assert/strict';
import {createStore} from '../extension/store.js';

function storage() {
  let state = {};
  return {async get(key) {await new Promise(r=>setTimeout(r,1)); return structuredClone({[key]:state[key]});},async set(data) {await new Promise(r=>setTimeout(r,1));Object.assign(state,structuredClone(data));}};
}
const lookup={word:'remember',meanings:[{partOfSpeech:'verb',definitions:[{definition:'To recall.'}]}]};

test('duplicate save updates context without resetting review or notes', async () => {
  const s=createStore(storage());
  await s.save(lookup,{sentence:'Remember this.'},1000);
  await s.edit('remember',{note:'my mnemonic',translation:'记住'});
  await s.rate('remember','remembered',2000);
  await s.save(lookup,{sentence:'Remember that.'},3000);
  const [r]=await s.list();
  assert.equal(r.dueAt,86402000);
  assert.equal(r.createdAt,1000);
  assert.equal(r.note,'my mnemonic');
  assert.equal(r.context.sentence,'Remember that.');
});

test('concurrent writes do not lose vocabulary records', async () => {
  const s=createStore(storage());
  await Promise.all(['remember','memory','origin'].map(word=>s.save({...lookup,word},{},1000)));
  assert.equal((await s.list()).length,3);
});

test('backup round trip preserves progress and invalid import is atomic',async () => {
  const s=createStore(storage());
  await s.save(lookup,{},1000);
  await s.rate('remember','remembered',2000);
  const backup=await s.exportBackup();
  const other=createStore(storage());
  await other.importBackup(backup);
  assert.equal((await other.list())[0].dueAt,86402000);
  await assert.rejects(()=>other.importBackup({version:1,words:[{word:'bad'}]}));
  assert.equal((await other.list()).length,1);
});

test('stale cache remains available but is marked stale',async () => {
  const s=createStore(storage());
  await s.cacheSet('remember:dictionary',lookup,1000);
  assert.equal((await s.cacheGet('remember:dictionary',2000)).stale,false);
  assert.equal((await s.cacheGet('remember:dictionary',604802000)).stale,true);
  for(let i=0;i<205;i++) await s.cacheSet(`word:${i}`,lookup,2000+i);
  assert.equal(await s.cacheGet('remember:dictionary'),null);
});

test('valid dictionary word constructor is not confused with Object prototype',async()=>{
  const s=createStore(storage());
  await s.save({...lookup,word:'constructor'},{sentence:'A constructor creates an object.'},1000);
  const [entry]=await s.list();
  assert.equal(entry.word,'constructor');assert.equal(entry.note,'');assert.equal(entry.dueAt,1000);
  const other=createStore(storage());await other.importBackup(await s.exportBackup());
  assert.equal((await other.list())[0].word,'constructor');
});

test('save applies only explicit personal edits atomically with the vocabulary update',async()=>{
 const s=createStore(storage());await s.save(lookup,{},1000,{note:'first note',translation:'我的释义'});
 assert.equal((await s.list())[0].note,'first note');
 await s.save(lookup,{},2000,{note:'changed note'});
 const [entry]=await s.list();assert.equal(entry.note,'changed note');assert.equal(entry.translation,'我的释义');
});
