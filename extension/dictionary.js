import {normalizeWord, cleanLookup, safeUrl} from './core.js';
const LANG = {en:'English',enm:'Middle English',ang:'Old English',fro:'Old French',fr:'French',la:'Latin','la-lat':'Late Latin',grc:'Ancient Greek',el:'Greek','ine-pro':'Proto-Indo-European','gem-pro':'Proto-Germanic',non:'Old Norse',de:'German',nl:'Dutch',it:'Italian',ar:'Arabic'};
const language=code=>LANG[code] || code;
const unique=items=>[...new Set(items.filter(Boolean))];
function templateText(body) {
  const fields=body.split('|'); const name=fields.shift().trim();
  const positional=fields.filter(x=>!x.includes('='));
  const named=Object.fromEntries(fields.filter(x=>x.includes('=')).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1)];}));
  if(['m','l','link','mention','cog','noncog','t','t+','t-check','t+check'].includes(name)) {
    const term=named.alt || positional[1] || ''; const gloss=named.t || named.gloss || positional[3];
    return term + (gloss ? ' (“'+gloss+'”)' : '');
  }
  if(['inh','der','bor','borrowed','inherited','derived'].includes(name)) {
    const term=named.alt || positional[2] || ''; const gloss=named.t || named.gloss || positional[4];
    return language(positional[1])+' '+term+(gloss ? ' (“'+gloss+'”)' : '');
  }
  if(['af','affix','prefix','suffix','compound','confix','com'].includes(name)) return positional.slice(1).join(' + ');
  if(name==='root') return '';
  if(['q','qual','qualifier','sense'].includes(name)) return '('+positional.join(', ')+')';
  if(name==='w') return positional[1] || positional[0] || '';
  return '';
}
function plainWiki(input) {
  let s=input.replace(/<!--[^]*?-->/g,'').replace(/<ref\b[^]*?<\/ref>/gi,'').replace(/<ref[^>]*\/>/gi,'');
  for(let i=0;i<18 && s.includes('{{');i++) s=s.replace(/\{\{([^{}]*)\}\}/g,(_,body)=>templateText(body));
  return s.replace(/\{\{[^]*?\}\}/g,'').replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,(_,target,label)=>label || target.replace(/^w:/,'')).replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g,'$1').replace(/'{2,5}/g,'').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
}
export function parseWiktionary(wikitext,word) {
  normalizeWord(word);
  const english=String(wikitext).match(/^==\s*English\s*==\s*$([^]*?)(?=^==[^=\n]+==\s*$|$(?![^]))/m)?.[1] || '';
  const sections=[...english.matchAll(/^(={3,})\s*([^=\n]+?)\s*={3,}\s*$([^]*?)(?=^={3,}[^=\n]+={3,}\s*$|$(?![^]))/gm)];
  const origins=sections.filter(m=>/^Etymology(?:\s+\d+)?$/.test(m[2]));
  const etymology=origins.map(m=>{const text=plainWiki(m[3]);return text ? (origins.length>1 ? m[2]+'\n'+text : text) : '';}).filter(Boolean).join('\n\n').slice(0,12000);
  const roots=[]; const related=[];
  for(const match of origins) {
    const branch=origins.length>1 ? match[2].replace('Etymology','词源')+' · ' : '';
    for(const t of match[3].matchAll(/\{\{root\|en\|([^{}]+)\}\}/g)) {
      const [lang,...terms]=t[1].split('|');for(const term of terms.filter(x=>x && !x.includes('='))) roots.push(branch+language(lang)+' · '+term);
    }
    for(const t of match[3].matchAll(/\{\{(?:af|affix|prefix|suffix|compound|confix)\|en\|([^{}]+)\}\}/g)) roots.push(branch+t[1].split('|').filter(x=>x && !x.includes('=')).join(' + '));
    for(const t of match[3].matchAll(/\{\{cog\|en\|([^|{}]+)/g)) related.push(t[1]);
  }
  const translations=unique([...english.matchAll(/\{\{t(?:\+|\+?check)?\|(?:cmn|zh)\|([^|{}]+)/g)].map(m=>plainWiki(m[1]))).slice(0,8);
  for(const s of sections.filter(m=>m[2]==='Related terms')) {
    for(const t of s[3].matchAll(/\{\{(?:l|m)\|en\|([^|{}]+)/g)) related.push(t[1]);
    for(const t of s[3].matchAll(/\{\{col\d?\|en\|([^{}]+)\}\}/g)) related.push(...t[1].split('|').filter(x=>x && !x.includes('=')));
  }
  return {etymology,roots:unique(roots).slice(0,12),related:unique(related).filter(x=>x!==word).slice(0,12),translations};
}
export function parseKaikki(text,word) {
  if(typeof text!=='string' || text.length>2000000)throw new Error('镜像词条数据过大或无效。');
  const records=text.split('\n').filter(line=>line.trim()).map(line=>JSON.parse(line)).filter(r=>r.lang_code==='en' && r.word?.toLowerCase()===word);
  const numbered=new Set(records.map(r=>r.etymology_number).filter(Boolean)).size>1;
  const origins=[];const roots=[];const related=[];const translations=[];
  for(const r of records){
    const branch=numbered ? '词源 '+r.etymology_number+' · ' : '';
    if(typeof r.etymology_text==='string')origins.push((numbered ? 'Etymology '+r.etymology_number+'\n' : '')+r.etymology_text);
    for(const t of Array.isArray(r.etymology_templates)?r.etymology_templates:[]){
      const args=t.args || {};
      if(t.name==='root' && args['1']==='en'){
        const terms=Object.entries(args).filter(([key])=>/^\d+$/.test(key) && Number(key)>=3).map(([,value])=>value);
        for(const term of terms)roots.push(branch+language(args['2'])+' · '+term);
      }
      if(['af','affix','prefix','suffix','compound','confix'].includes(t.name) && args['1']==='en'){
        const terms=Object.entries(args).filter(([key])=>/^\d+$/.test(key) && Number(key)>=2).map(([,value])=>value);
        roots.push(branch+terms.join(' + '));
      }
      if(t.name==='cog' && args['1']==='en')related.push(args['2']);
    }
    for(const item of Array.isArray(r.related)?r.related:[])if(!item.source && typeof item.word==='string')related.push(item.word);
    for(const t of Array.isArray(r.translations)?r.translations:[])if(['cmn','zh'].includes(t.lang_code || t.code) && typeof t.word==='string')translations.push(t.word);
  }
  return {etymology:unique(origins).join('\n\n').slice(0,12000),roots:unique(roots).slice(0,12),related:unique(related).filter(w=>/^[a-z]+(?:['-][a-z]+)*$/i.test(w) && w!==word).slice(0,12),translations:unique(translations).slice(0,8)};
}

async function getJSON(url,fetcher,mode='json') {
  for(let attempt=0;attempt<2;attempt++) {
    try {
      const r=await fetcher(url,{signal:AbortSignal.timeout(12000)});
      if(!r.ok) {const err=new Error(r.status===404 ? '暂未找到这个词条。' : '词典服务暂不可用 ('+r.status+')。');err.retry=r.status>=500;throw err;}
      return await (mode==='text' ? r.text() : r.json());
    } catch(e) {
      if(attempt || e.retry===false || !(e instanceof TypeError || e.name==='TimeoutError' || e.retry)) throw e;
      await new Promise(r=>setTimeout(r,150));
    }
  }
}
export async function lookupDictionary(input,fetcher=fetch) {
  const word=normalizeWord(input);
  const data=await getJSON('https://api.dictionaryapi.dev/api/v2/entries/en/'+encodeURIComponent(word),fetcher);
  if(!Array.isArray(data) || !data.length) throw new Error('词典返回的数据无效。');
  const phonetics=data.flatMap(x=>Array.isArray(x.phonetics)?x.phonetics:[]);
  const meanings=data.flatMap(x=>Array.isArray(x.meanings)?x.meanings:[]);
  if(!meanings.some(m=>Array.isArray(m.definitions) && m.definitions.some(d=>typeof d.definition==='string'))) throw new Error('暂未找到可用释义。');
  return cleanLookup({word,phonetic:data[0].phonetic || phonetics.find(x=>x.text)?.text,audio:phonetics.map(x=>safeUrl(x.audio)).find(Boolean),meanings,sources:[{name:'Free Dictionary API / Wiktionary',url:'https://en.wiktionary.org/wiki/'+encodeURIComponent(word),license:data[0].license?.name || '来源词典许可'}]});
}
export async function lookupEtymology(input,fetcher=fetch) {
  const word=normalizeWord(input);
  const originalURL='https://en.wiktionary.org/wiki/'+encodeURIComponent(word)+'#English';
  const mirrorPath='https://kaikki.org/dictionary/English/meaning/'+encodeURIComponent(word.slice(0,1))+'/'+encodeURIComponent(word.slice(0,2))+'/'+encodeURIComponent(word);
  const original=(async()=>{
    const data=await getJSON('https://en.wiktionary.org/w/api.php?action=parse&page='+encodeURIComponent(word)+'&prop=wikitext&format=json&origin=*',fetcher);
    if(typeof data.parse?.wikitext?.['*']!=='string')throw new Error('暂未找到词源词条。');
    return {parsed:parseWiktionary(data.parse.wikitext['*'],word),sources:[{name:'Wiktionary · 历史词源',url:originalURL,license:'CC BY-SA 4.0 / GFDL'}]};
  })();
  const mirror=(async()=>{
    const data=await getJSON(mirrorPath+'.jsonl',fetcher,'text');const parsed=parseKaikki(data,word);
    if(!parsed.etymology && !parsed.translations.length)throw new Error('镜像未提供可用词源或译词。');
    return {parsed,sources:[{name:'Wiktionary · 原词条',url:originalURL,license:'CC BY-SA / GFDL'},{name:'Kaikki · Wiktionary 数据镜像',url:mirrorPath+'.html',license:'遵循原词条许可'}]};
  })();
  let result;try{result=await Promise.any([original,mirror]);}catch{throw new Error('词源来源暂不可用，请重试或查看原词条。');}
  const {parsed,sources}=result;
  return {word,...parsed,translation:parsed.translations.join('；'),translationKind:parsed.translations.length ? '词典译词' : '',sources,warnings:parsed.etymology ? [] : ['暂未找到词源。']};
}

export async function translateText(input,fetcher=fetch) {
  const text=String(input || '').trim();
  if(!text || text.length>500) throw new Error('一次最多翻译 500 个字符。');
  const data=await getJSON('https://api.mymemory.translated.net/get?q='+encodeURIComponent(text)+'&langpair=en%7Czh-CN',fetcher);
  if(Number(data.responseStatus)!==200 || data.quotaFinished || typeof data.responseData?.translatedText!=='string' || !data.responseData.translatedText.trim()) throw new Error('自动翻译暂不可用或已达限额，可填写自己的中文释义。');
  return data.responseData.translatedText.slice(0,3000);
}
