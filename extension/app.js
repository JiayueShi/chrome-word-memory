import {renderCard,element,link,pronunciationButton} from './card.js';
import {normalizeWord} from './core.js';
const $=id=>document.getElementById(id);
let words=[],tab='lookup',lookupController,detailController,queue=[],reviewIndex=0,grading=false,reviewSession=0;
if(new URLSearchParams(location.search).has('full')){document.body.classList.add('full');$('expand').hidden=true;}
async function send(message){const r=await chrome.runtime.sendMessage(message);if(!r?.ok)throw new Error(r?.error || '扩展未响应，请重新打开。');return r.data;}
function status(text=''){$('status').textContent=text;}
function button(text,fn,cls='quiet'){const b=element('button',text,cls);b.type='button';b.addEventListener('click',fn);return b;}
async function refresh(){words=await send({type:'LIST'});$('total').textContent=words.length;const due=words.filter(r=>r.dueAt<=Date.now()).length;$('due').textContent=due;$('due-badge').textContent=due;}
async function switchTab(next){const session=++reviewSession;tab=next;status();for(const button of document.querySelectorAll('[data-tab]'))button.classList.toggle('active',button.dataset.tab===tab);for(const name of ['lookup','library','review'])$(name+'-panel').hidden=name!==tab;
  try{await refresh();if(session!==reviewSession)return;if(tab==='library')renderLibrary();if(tab==='review'){queue=words.filter(r=>r.dueAt<=Date.now()).sort((a,b)=>a.dueAt-b.dueAt);reviewIndex=0;renderReview();}}catch(e){status(e.message);}
}
for(const b of document.querySelectorAll('[data-tab]'))b.addEventListener('click',()=>switchTab(b.dataset.tab));
$('expand').addEventListener('click',()=>chrome.tabs.create({url:chrome.runtime.getURL('app.html?full=1')}));
function lookup(word){try{word=normalizeWord(word);lookupController?.close();$('welcome').hidden=true;lookupController=renderCard($('lookup-card'),word,{},send,{onSaved:()=>refresh().catch(e=>status(e.message)),onRelated:term=>{$('word-input').value=term;lookup(term);}});status();}catch(e){status(e.message);}}
$('lookup-form').addEventListener('submit',e=>{e.preventDefault();lookup($('word-input').value);});
$('filter').addEventListener('input',renderLibrary);
function renderLibrary(){
  $('detail').replaceChildren();detailController?.close();detailController=null;
  const query=$('filter').value.trim().toLowerCase();const matches=words.filter(r=>[r.word,r.translation,r.note].some(v=>v.toLowerCase().includes(query))).sort((a,b)=>b.createdAt-a.createdAt);
  const library=$('library');library.replaceChildren();library.hidden=false;
  if(!matches.length){const empty=element('div',undefined,'empty');empty.append(element('h2',query ? '没有匹配的单词' : '你的生词本，从阅读开始。'),element('p',query ? '试试其他单词、释义或笔记。' : '查词后点击「加入生词本」，留下原句和联想。'));library.append(empty);return;}
  for(const record of matches){const row=button('',()=>showDetail(record),'word-row');const left=element('span');left.append(element('span',record.word,'word-name'),element('span',record.translation || record.lookup.meanings[0]?.definitions[0]?.definition || '尚未填写释义','word-desc'));const due=record.dueAt<=Date.now();const when=due ? '待复习' : '下次 '+new Date(record.dueAt).toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'});row.append(left,element('span',when,'word-time'+(due?' due-now':'')));library.append(row);}
}
function showDetail(record){
  detailController?.close();$('library').hidden=true;$('detail').replaceChildren();
  const head=element('div',undefined,'detail-head');head.append(button('← 返回生词本',()=>{detailController?.close();renderLibrary();}),button('删除单词',async()=>{if(!confirm('删除 '+record.word+'？建议先导出备份。'))return;try{await send({type:'DELETE',word:record.word});await refresh();renderLibrary();}catch(e){status(e.message);}},'quiet delete'));
  const host=element('div');$('detail').append(head,host);detailController=renderCard(host,record.word,record.context,send,{initialLookup:{...record.lookup,translation:record.translation},record,onSaved:()=>refresh().catch(e=>status(e.message)),onRelated:term=>{switchTab('lookup');$('word-input').value=term;lookup(term);}});
}
$('export').addEventListener('click',async()=>{try{const backup=await send({type:'EXPORT'});const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=element('a');a.href=url;a.download='word-memory-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);status('备份已导出，包含原句、笔记和复习进度。');}catch(e){status(e.message);}});
$('import').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>8*1024*1024)throw new Error('备份文件超过 8 MB。');const backup=JSON.parse(await file.text());const result=await send({type:'IMPORT',backup});await refresh();renderLibrary();status('新增 '+result.added+' 个单词。已有单词保留当前内容和复习进度。');}catch(e){status(e.message);}finally{event.target.value='';}});
function renderReview(){
  const area=$('review');area.replaceChildren();const r=queue[reviewIndex];const session=reviewSession;
  if(!r){const empty=element('div',undefined,'empty');empty.append(element('h2',queue.length ? '这一轮，记住了。' : '今天暂时没有到期单词。'),element('p','下次阅读时继续积累。复习会在到期后出现在这里。'),button('去查一个词',()=>switchTab('lookup'),'primary'));area.append(empty);return;}
  const card=element('article',undefined,'review-card');card.append(element('p','ACTIVE RECALL · '+(reviewIndex+1)+' / '+queue.length,'review-label'),element('h2',r.word,'review-word'));
  const audioStatus=element('p','','review-label');audioStatus.setAttribute('role','status');card.append(pronunciationButton(r.word,send,text=>{if(session===reviewSession && tab==='review')audioStatus.textContent=text;},'quiet'),audioStatus);
  if(r.context.sentence)card.append(element('blockquote',r.context.sentence,'review-context'));
  card.append(element('p','先想想它的意思，你能记起它的来处吗？','review-question'));
  const reveal=button('显示答案',()=>{
    reveal.remove();const answer=element('div',undefined,'review-answer');answer.append(element('h3','释义'),element('p',r.translation || '暂无中文释义'));
    for(const m of r.lookup.meanings.slice(0,2))for(const d of m.definitions.slice(0,2))answer.append(element('p',d.definition));
    if(r.lookup.roots.length)answer.append(element('h3','词根 / 构词'),element('p',r.lookup.roots.join(' · ')));
    if(r.lookup.etymology)answer.append(element('h3','词源'),element('p',r.lookup.etymology,'origin-text'));
    if(r.note)answer.append(element('h3','我的记忆笔记'),element('p',r.note));
    if(r.context.url)answer.append(link(r.context.title || '阅读来源',r.context.url));
    const grades=element('div',undefined,'grades');
    for(const [grade,label] of [['forgotten','忘了 · 10 分钟'],['unsure','模糊 · 1 天'],['remembered','记住了']])grades.append(button(label,async()=>{if(grading)return;grading=true;for(const b of grades.children)b.disabled=true;try{await send({type:'RATE',word:r.word,grade});await refresh();if(session===reviewSession && tab==='review'){reviewIndex++;renderReview();}}catch(e){status(e.message);for(const b of grades.children)b.disabled=false;}finally{grading=false;}},''));
    card.append(answer,grades);
  },'primary');card.append(reveal);area.append(card);
}
refresh().catch(e=>status(e.message));
