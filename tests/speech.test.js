import test from 'node:test';
import assert from 'node:assert/strict';
import * as worker from '../extension/worker.js';
const voices=[{voiceName:'Cloud',lang:'en-US',remote:true},{voiceName:'Tingting',lang:'zh-CN',remote:false},{voiceName:'Samantha',lang:'en-US',remote:false}];
function engine(list=voices){
 const runtime={};let utterance;
 const tts={getVoices(callback){queueMicrotask(()=>callback(list));},speak(word,options,callback){utterance={word,options};callback();}};
 return {tts,runtime,get utterance(){return utterance;},event(type,errorMessage){utterance.options.onEvent({type,errorMessage});}};
}
test('speech chooses installed English instead of Chinese or a remote voice and waits for completion',async()=>{
 const api=engine();let done=false;
 const result=worker.speakWord('Remember!',api.tts,api.runtime).then(r=>{done=true;return r;});
 await new Promise(r=>setImmediate(r));
 assert.equal(api.utterance.word,'remember');assert.equal(api.utterance.options.voiceName,'Samantha');assert.equal(api.utterance.options.lang,'en-US');
 api.event('start');await new Promise(r=>setImmediate(r));assert.equal(done,false,'Accepted/started speech is not completed speech');
 api.event('end');assert.deepEqual(await result,{source:'system',voice:'Samantha',lang:'en-US',status:'finished'});
});
test('speech uses a local British voice when no local US voice is installed',async()=>{
 const api=engine([{voiceName:'Daniel',lang:'en-GB',remote:false}]);const result=worker.speakWord('origin',api.tts,api.runtime);
 await new Promise(r=>setImmediate(r));api.event('end');assert.equal((await result).lang,'en-GB');
});
test('missing local English voice gives an actionable error instead of silently choosing Chinese',async()=>{
 const api=engine(voices.slice(0,2));await assert.rejects(()=>worker.speakWord('remember',api.tts,api.runtime),/英语语音/);
 assert.equal(api.utterance,undefined);
});
test('synthesis error is reported rather than falsely claiming successful playback',async()=>{
 const api=engine();const result=worker.speakWord('remember',api.tts,api.runtime);const rejected=assert.rejects(result,/synthesis failed/);
 await new Promise(r=>setImmediate(r));api.event('error','synthesis failed');await rejected;
});
test('Chrome speak callback error is surfaced',async()=>{
 const api=engine();api.tts.speak=(word,options,callback)=>{api.runtime.lastError={message:'voice unavailable'};callback();delete api.runtime.lastError;};
 await assert.rejects(()=>worker.speakWord('remember',api.tts,api.runtime),/voice unavailable/);
});
test('speech interruption completes the old request so another word can play',async()=>{
 const api=engine();const result=worker.speakWord('remember',api.tts,api.runtime);
 await new Promise(r=>setImmediate(r));api.event('interrupted');assert.equal((await result).status,'interrupted');
});
test('invalid input and missing extension speech permission produce errors',async()=>{
 const api=engine();await assert.rejects(()=>worker.speakWord('two words',api.tts,api.runtime),/英文单词/);
 await assert.rejects(()=>worker.speakWord('remember',undefined,{}),/重新加载/);
});
test('first click waits for native voices to initialize instead of reporting them missing',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const api=engine();let calls=0;let error;
 api.tts.getVoices=callback=>queueMicrotask(()=>callback(++calls===1 ? [] : voices));
 const result=worker.speakWord('remember',api.tts,api.runtime).catch(e=>{error=e;});
 await new Promise(r=>setImmediate(r));assert.equal(api.utterance,undefined);
 t.mock.timers.tick(250);await new Promise(r=>setImmediate(r));
 assert.ok(api.utterance,'An initially empty voice list must be retried');api.event('end');
 await result;assert.equal(error,undefined);
});
test('a silent engine reports a timeout and allows retry',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const api=engine();const result=worker.speakWord('remember',api.tts,api.runtime);const rejected=assert.rejects(result,/没有响应/);
 await new Promise(r=>setImmediate(r));t.mock.timers.tick(8000);await rejected;
});
test('a late voice lookup cannot replace a newer pronunciation request',async()=>{
 const api=engine();const callbacks=[];api.tts.getVoices=callback=>callbacks.push(callback);
 const old=worker.speakWord('remember',api.tts,api.runtime);const current=worker.speakWord('origin',api.tts,api.runtime);
 callbacks[1](voices);callbacks[0](voices);assert.equal((await old).status,'interrupted');assert.equal(api.utterance.word,'origin');
 api.event('end');assert.equal((await current).status,'finished');
});
