import {normalizeWord,cleanLookup,safeUrl} from './core.js';
export function element(tag, text, className) {
  const node=document.createElement(tag);if(text!==undefined) node.textContent=text;if(className) node.className=className;return node;
}
export function link(text,url) {
  const a=element('a',text);a.href=safeUrl(url);a.target='_blank';a.rel='noopener noreferrer';return a;
}
export function pronunciationButton(word,send,onStatus,cls='wm-audio') {
  const b=element('button','▶ 发音',cls);b.type='button';b.title='使用本机英语语音发音';
  b.addEventListener('click',async()=>{
    if(b.disabled)return;b.disabled=true;b.textContent='发音中…';onStatus('正在发音…');
    try {const result=await send({type:'SPEAK',word});
      const accent=result.lang==='en-US' ? '美式' : result.lang==='en-GB' ? '英式' : '英语';
      onStatus(result.status==='interrupted' ? '已停止发音。' : '播放完成 · 系统'+accent+'发音。');
    }catch(error){onStatus(error.message || '发音失败，请重试。');}
    finally{b.disabled=false;b.textContent='▶ 发音';}
  });return b;
}
export function renderCard(container,input,context,send,options={}) {
  const word=normalizeWord(input);let closed=false;let saving=false;let saved=false;
  let dictionaryDone=!!options.initialLookup;let etymologyDone=!!options.initialLookup;
  let lookup=cleanLookup(options.initialLookup || {word});
  if(options.record && options.record.translation!==options.record.lookup.translation)lookup.translationKind='个人释义 / 可编辑';
  let note=options.record?.note || '';let translation=options.record?.translation || lookup.translation;
  let translationEdited=!!options.record;let translationDirty=false;let noteDirty=false;let feedback='';let etymologyTranslation='';
  const root=container.shadowRoot || container.attachShadow({mode:'open'});
  const sheet=element('link');sheet.rel='stylesheet';sheet.href=new URL('./card.css',import.meta.url).href;
  const card=element('article',undefined,'wm-card');card.setAttribute('aria-label','单词 '+word);root.replaceChildren(sheet,card);
  const close=()=>{closed=true;options.onClose?.();};
  const button=(text,fn,cls='wm-button')=>{const b=element('button',text,cls);b.type='button';b.addEventListener('click',fn);return b;};
  function section(title) {const s=element('section',undefined,'wm-section');s.append(element('h3',title));card.append(s);return s;}
  async function translate(kind) {
    const text=kind==='etymology' ? lookup.etymology : lookup.meanings[0]?.definitions[0]?.definition;
    if(!text) return;
    feedback='正在翻译…';draw();
    try {const result=await send({type:'TRANSLATE',text:text.slice(0,500)});if(closed)return;
      if(kind==='etymology') etymologyTranslation=result;
      else {translation=result;translationEdited=true;translationDirty=true;lookup.translationKind='自动翻译，仅供参考';}
      feedback=kind==='etymology' && text.length>500 ? '已翻译词源前 500 个字符。' : '自动翻译仅供参考，可自行修订。';
    } catch(e) {if(closed)return;feedback=e.message;}
    draw();
  }
  async function save() {
    if(saving)return;saving=true;feedback='';draw();
    try {
      const data=cleanLookup({...lookup,translation});const patch={};
      if(noteDirty)patch.note=note;if(translationDirty)patch.translation=translation;
      const entry=await send({type:'SAVE',lookup:data,context,patch});
      if(entry.translation!==data.translation)lookup.translationKind='个人释义 / 可编辑';
      note=entry.note;translation=entry.translation;noteDirty=false;translationDirty=false;
      saved=true;feedback='已保存在本机，复习进度会保留。';options.onSaved?.();
    } catch(e) {feedback=e.message;}finally {saving=false;if(!closed)draw();}
  }
  function draw() {
    if(closed)return;card.replaceChildren();
    const top=element('div',undefined,'wm-top');top.append(element('span','词间 / WORD MEMORY','wm-brand'));
    if(options.onClose)top.append(button('×',close,'wm-close'));card.append(top);
    const heading=element('div',undefined,'wm-heading');heading.append(element('h2',word));
    const audioStatus=element('p','','wm-muted');audioStatus.hidden=true;audioStatus.dataset.speechStatus='';audioStatus.setAttribute('role','status');
    heading.append(pronunciationButton(word,send,text=>{if(closed)return;const status=root.querySelector('[data-speech-status]');if(status){status.hidden=false;status.textContent=text;}}));card.append(heading,audioStatus);
    if(lookup.phonetic)card.append(element('p',lookup.phonetic,'wm-phonetic'));
    const meaning=section('01 / 释义');
    if(translation) {meaning.append(element('p',translation,'wm-translation'));meaning.append(element('small',lookup.translationKind || '个人释义 / 可编辑'));}
    else meaning.append(element('p',dictionaryDone ? '暂无中文译词，可以翻译英文释义或自行填写。' : '正在查询词典…','wm-muted'));
    for(const m of lookup.meanings) {
      const block=element('div',undefined,'wm-meaning');block.append(element('span',m.partOfSpeech,'wm-pos'));
      const list=element('ol');for(const d of m.definitions.slice(0,3)){const item=element('li',d.definition);if(d.example)item.append(element('p',d.example,'wm-example'));list.append(item);}block.append(list);meaning.append(block);
    }
    if(lookup.meanings.length)meaning.append(button('翻译首条释义',()=>translate('meaning'),'wm-text-button'));
    const origin=section('02 / 词源与构词');
    if(lookup.roots.length) {const chips=element('div',undefined,'wm-chips');for(const term of lookup.roots)chips.append(element('span',term,'wm-chip'));origin.append(chips);}
    if(lookup.etymology) {const details=element('details');details.open=true;details.append(element('summary','历史词源 · 原文'));details.append(element('p',lookup.etymology,'wm-etymology'));origin.append(details);origin.append(button('翻译词源开头',()=>translate('etymology'),'wm-text-button'));}
    else origin.append(element('p',etymologyDone ? '暂未找到词源，可查看来源词典。' : '正在追溯词源…','wm-muted'));
    if(etymologyTranslation)origin.append(element('p','自动翻译（仅供参考）：'+etymologyTranslation,'wm-etymology'));
    if(lookup.related.length) {origin.append(element('small','来源词典中的关联词'));const related=element('div',undefined,'wm-chips');for(const term of lookup.related){const b=button(term,()=>options.onRelated?.(term),'wm-chip wm-related');b.disabled=!options.onRelated;related.append(b);}origin.append(related);}
    if(context?.sentence) {const ctx=section('03 / 你读到的原句');ctx.append(element('blockquote',context.sentence));if(context.url)ctx.append(link(context.title || '返回阅读来源',context.url));}
    const notes=section('记忆线索');
    const label=element('label','我的中文释义');const input=element('input');input.value=translation;input.maxLength=12000;input.placeholder='写下你理解的意思';input.addEventListener('input',()=>{translation=input.value;translationEdited=true;translationDirty=true;lookup.translationKind='个人释义 / 可编辑';});label.append(input);notes.append(label);
    const noteLabel=element('label','我的联想 / 记忆笔记');const textarea=element('textarea');textarea.value=note;textarea.rows=2;textarea.maxLength=12000;textarea.placeholder='把词源、原句和自己的联想连起来…';textarea.addEventListener('input',()=>{note=textarea.value;noteDirty=true;});noteLabel.append(textarea);notes.append(noteLabel);
    const footer=element('div',undefined,'wm-footer');const saveButton=button(saving ? '保存中…' : saved ? '保存修改' : options.record ? '保存修改' : '加入生词本',save,'wm-button wm-primary');saveButton.disabled=saving || !dictionaryDone || !etymologyDone;footer.append(saveButton);
    if(!dictionaryDone || !etymologyDone)footer.append(element('small','等待词典查询完成'));else if(!options.initialLookup)footer.append(button('重新查询',()=>load(true),'wm-text-button'));
    card.append(footer);if(feedback){const status=element('p',feedback,'wm-feedback');status.setAttribute('role','status');card.append(status);}
    for(const warning of [...new Set(lookup.warnings)])card.append(element('p',warning,'wm-warning'));
    const sources=element('details',undefined,'wm-sources');sources.append(element('summary','数据来源与许可 · 本地保存，联网查词'));
    for(const source of lookup.sources){const line=element('p');line.append(link(source.name,source.url));if(source.license)line.append(element('small',' · '+source.license));sources.append(line);}card.append(sources);
  }
  let generation=0;
  async function load(force=false) {
    const id=++generation;dictionaryDone=false;etymologyDone=false;lookup.warnings=[];draw();
    async function run(type) {
      try {const data=await send({type,word,force});if(closed || id!==generation)return;
        const sources=[...lookup.sources,...(data.sources || [])].filter((s,i,a)=>a.findIndex(x=>x.name===s.name)===i);
        const warnings=[...lookup.warnings,...(data.warnings || [])];
        if(type==='QUERY_DICTIONARY')lookup=cleanLookup({...lookup,phonetic:data.phonetic,audio:data.audio,meanings:data.meanings,sources,warnings});
        else lookup=cleanLookup({...lookup,etymology:data.etymology,roots:data.roots,related:data.related,translation:data.translation,translationKind:translationEdited ? lookup.translationKind : data.translationKind,sources,warnings});
        if(!translationEdited && data.translation)translation=data.translation;
      }catch(e){if(closed || id!==generation)return;lookup.warnings.push(e.message || '查询失败。');}
      finally {if(!closed && id===generation){if(type==='QUERY_DICTIONARY')dictionaryDone=true;else etymologyDone=true;draw();}}
    }
    await Promise.all([run('QUERY_DICTIONARY'),run('QUERY_ETYMOLOGY')]);
  }
  draw();if(!options.initialLookup)load();
  return {close, getLookup:()=>lookup};
}
