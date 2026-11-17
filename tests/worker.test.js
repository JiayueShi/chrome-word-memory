import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../extension/worker.js';
import {createStore} from '../extension/store.js';
function local() {let data={};return {async get(key){return structuredClone({[key]:data[key]});},async set(next){Object.assign(data,structuredClone(next));}};}
const lookup={word:'remember',meanings:[{partOfSpeech:'verb',definitions:[{definition:'Recall.'}]}],etymology:'From Latin memor.'};
test('offline lookup recovers saved vocabulary even without a query cache',async()=>{
 const store=createStore(local());await store.save(lookup,{});
 const handle=createHandler(store,{dictionary:async()=>{throw new Error('offline');},etymology:async()=>{throw new Error('offline');}});
 const result=await handle({type:'QUERY_DICTIONARY',word:'remember'});
 assert.equal(result.meanings[0].definitions[0].definition,'Recall.');
 assert.ok(result.warnings.some(w=>w.includes('本地')));
 assert.equal((await handle({type:'QUERY_ETYMOLOGY',word:'remember'})).etymology,'From Latin memor.');
});
test('etymology failure does not prevent successful dictionary result',async()=>{
 const handle=createHandler(createStore(local()),{dictionary:async()=>lookup,etymology:async()=>{throw new Error('not available');}});
 assert.equal((await handle({type:'QUERY_DICTIONARY',word:'remember'})).word,'remember');
 await assert.rejects(()=>handle({type:'QUERY_ETYMOLOGY',word:'unknown'}));
});
