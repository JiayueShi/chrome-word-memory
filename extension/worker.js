import {normalizeWord} from './core.js';
import {createStore} from './store.js';
import {lookupDictionary,lookupEtymology,translateText} from './dictionary.js';
export function createHandler(store, providers = {}) {
  const dictionary=providers.dictionary || lookupDictionary;
  const etymology=providers.etymology || lookupEtymology;
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
