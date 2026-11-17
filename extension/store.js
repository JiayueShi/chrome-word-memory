import {normalizeWord, cleanLookup, cleanContext, scheduleReview, validateBackup} from './core.js';
const WORDS = 'wordMemoryWords';
const CACHE = 'wordMemoryCache';
export function createStore(storage) {
  let pending=Promise.resolve();
  const read=async key => (await storage.get(key))[key] || {};
  const serialize = fn => { const task=pending.then(fn); pending=task.catch(()=>{}); return task; };
  const update = fn => serialize(async()=>{ const words=await read(WORDS); const result=fn(words); await storage.set({[WORDS]:words});return result; });
  return {
    async list() { await pending; return Object.values(await read(WORDS)); },
    save(lookup,context,now=Date.now(),patch={}) {
      const data=cleanLookup(lookup);
      return update(words=>{
        const old=Object.hasOwn(words,data.word) ? words[data.word] : null;
        if(!old && Object.keys(words).length>=5000) throw new Error('生词本已达 5000 词，请先导出并清理。');
        const entry=old ? {...old,lookup:data,context:cleanContext(context)} : {word:data.word,lookup:data,context:cleanContext(context),note:'',translation:data.translation,repetitions:0,intervalDays:0,dueAt:now,createdAt:now,lastReviewedAt:null};
        for(const field of ['note','translation']) if(typeof patch[field]==='string') entry[field]=patch[field].slice(0,12000);
        words[data.word]=entry;return entry;
      });
    },
    edit(word,patch) { return update(words=>{
      const key=normalizeWord(word); if(!Object.hasOwn(words,key)) throw new Error('单词已删除。');
      for(const field of ['note','translation']) if(typeof patch[field]==='string') words[key][field]=patch[field].slice(0,12000);
      return words[key];
    }); },
    remove(word) { return update(words=>{delete words[normalizeWord(word)];}); },
    rate(word,grade,now=Date.now()) { return update(words=>{
      const key=normalizeWord(word); if(!Object.hasOwn(words,key)) throw new Error('单词已删除。');
      words[key]=scheduleReview(words[key],grade,now);return words[key];
    }); },
    async exportBackup() { return {version:1,exportedAt:Date.now(),words:await this.list()}; },
    async importBackup(data) {
      const entries=validateBackup(data);
      return update(words=>{
        const merged={...words};for(const entry of entries) if(!Object.hasOwn(merged,entry.word)) merged[entry.word]=entry;
        if(Object.keys(merged).length>5000) throw new Error('合并后超过 5000 个单词。');
        const added=Object.keys(merged).length-Object.keys(words).length;
        Object.assign(words,merged);return {added,imported:entries.length};
      });
    },
    async cacheGet(key,now=Date.now()) { await pending; const entry=(await read(CACHE))[key];return entry ? {...entry,stale:now-entry.at>604800000} : null; },
    cacheSet(key,data,now=Date.now()) { return serialize(async()=>{
      const cache=await read(CACHE);cache[key]={data,at:now};
      const keys=Object.keys(cache).sort((a,b)=>cache[b].at-cache[a].at);
      for(const k of keys.slice(200)) delete cache[k];
      await storage.set({[CACHE]:cache});
    }); }
  };
}
