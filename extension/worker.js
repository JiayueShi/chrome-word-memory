import {normalizeWord} from './core.js';
import {createStore} from './store.js';
import {lookupDictionary,lookupEtymology,translateText} from './dictionary.js';
let speechGeneration=0;
export async function speakWord(input,tts=globalThis.chrome?.tts,runtime=globalThis.chrome?.runtime) {
  const word=normalizeWord(input);const generation=++speechGeneration;
  if(!tts?.getVoices || !tts?.speak)throw new Error('请在 chrome://extensions 重新加载扩展，启用发音权限。');
  return new Promise((resolve,reject)=>{
    let settled=false;let timer;let retryTimer;let attempts=0;
    const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);clearTimeout(retryTimer);error ? reject(error) : resolve(result);};
    timer=setTimeout(()=>finish(new Error('英语语音没有响应，请检查系统声音或重新打开 Chrome。')),8000);
    const loadVoices=()=>{try {tts.getVoices(voices=>{
      if(settled)return;
      if(generation!==speechGeneration){finish(null,{source:'system',status:'interrupted'});return;}
      const error=runtime?.lastError?.message;
      if(error){finish(new Error('无法读取系统语音：'+error));return;}
      // Chrome can return an empty list while its native engine starts.
      if(!voices.length && attempts++<16){retryTimer=setTimeout(loadVoices,250);return;}
      const english=voices.filter(v=>!v.remote && /^en[-_]/i.test(v.lang || ''));
      const voice=english.find(v=>v.voiceName==='Samantha' && v.lang==='en-US') || english.find(v=>v.lang==='en-US') || english[0];
      if(!voice){finish(new Error('未找到本机英语语音。请在 macOS 系统设置 → 辅助功能 → 朗读内容中添加英语声音，再重新打开 Chrome。'));return;}
      const result={source:'system',voice:voice.voiceName,lang:voice.lang};
      try {tts.speak(word,{voiceName:voice.voiceName,lang:voice.lang,rate:0.9,enqueue:false,onEvent:event=>{
        if(settled)return;
        if(event.type==='start'){clearTimeout(timer);timer=setTimeout(()=>finish(new Error('发音超时，请重试。')),20000);}
        else if(event.type==='end')finish(null,{...result,status:'finished'});
        else if(event.type==='interrupted' || event.type==='cancelled')finish(null,{...result,status:'interrupted'});
        else if(event.type==='error')finish(new Error('无法播放英语发音：'+(event.errorMessage || '系统语音不可用。')));
      }},()=>{const error=runtime?.lastError?.message;if(error)finish(new Error('无法播放英语发音：'+error));});}
      catch(error){finish(error);}
    });} catch(error){finish(error);}};loadVoices();
  });
}
export function createHandler(store, providers = {}) {
  const dictionary=providers.dictionary || lookupDictionary;
  const etymology=providers.etymology || lookupEtymology;
  const pronounce=providers.pronounce || speakWord;
  const inflight=new Map();
  async function query(word,kind,force) {
    const key=word+':'+kind;
    const cached=await store.cacheGet(key);
    if(cached && !cached.stale && !force) return cached.data;
    if(inflight.has(key)) return inflight.get(key);
    const task=(async()=>{
      try {
        const data=await (kind==='dictionary' ? dictionary(word) : etymology(word));
        try {await store.cacheSet(key,data);}catch {data.warnings=[...(data.warnings || []),'缓存未写入，可能已达本地存储限额。'];}
        return data;
      } catch(error) {
        if(cached) return {...cached.data,warnings:[...(cached.data.warnings || []),'网络不可用，显示本地缓存。']};
        const saved=(await store.list()).find(r=>r.word===word);
        if(saved) return {...saved.lookup,translation:saved.translation,warnings:[...(saved.lookup.warnings || []),'网络不可用，显示本地生词本内容。']};
        throw error;
      } finally {inflight.delete(key);}
    })();
    inflight.set(key,task);return task;
  }
  return async function handle(message) {
    if(!message || typeof message.type!=='string') throw new Error('无效请求。');
    switch(message.type) {
      case 'QUERY_DICTIONARY': return query(normalizeWord(message.word),'dictionary',message.force);
      case 'QUERY_ETYMOLOGY': return query(normalizeWord(message.word),'etymology',message.force);
      case 'SPEAK': return pronounce(normalizeWord(message.word));
      case 'TRANSLATE': return translateText(message.text);
      case 'LIST': return store.list();
      case 'SAVE': return store.save(message.lookup,message.context,undefined,message.patch || {});
      case 'EDIT': return store.edit(message.word,message.patch || {});
      case 'DELETE': return store.remove(message.word);
      case 'RATE': return store.rate(message.word,message.grade);
      case 'EXPORT': return store.exportBackup();
      case 'IMPORT': return store.importBackup(message.backup);
      default: throw new Error('不支持的操作。');
    }
  };
}
if(globalThis.chrome?.runtime?.onMessage && chrome.storage?.local) {
  const handle=createHandler(createStore(chrome.storage.local));
  chrome.runtime.onMessage.addListener((message,sender,reply)=>{
    if(sender.id !== chrome.runtime.id) return false;
    handle(message).then(data=>reply({ok:true,data}),error=>reply({ok:false,error:error.message || '操作失败，请重试。'}));
    return true;
  });
}
