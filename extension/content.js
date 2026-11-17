(() => {
  let host,root,trigger,controller,selectionData;
  const getModule=()=>import(chrome.runtime.getURL('card.js'));
  const send=async message=>{try{const r=await chrome.runtime.sendMessage(message);if(!r?.ok)throw new Error(r?.error || '扩展未响应，请刷新网页。');return r.data;}catch(e){throw new Error(e.message.includes('context invalidated')?'扩展已更新，请刷新这个网页。':e.message);}};
  function close(){controller?.close();controller=null;host?.remove();host=null;root=null;trigger=null;}
  function dismiss(){const old=controller;controller=null;old?.close();host?.remove();host=null;root=null;trigger=null;}
  function createHost(){dismiss();host=document.createElement('div');host.dataset.wordMemory='';host.style.cssText='all:initial;position:fixed;z-index:2147483647;display:block;';document.documentElement.append(host);root=host.attachShadow({mode:'open'});}
  async function showCard(word,context,position){
    createHost();const current=host;const top=Math.min(Math.max(position.y,8),Math.max(8,innerHeight-350));current.style.left=Math.min(Math.max(position.x,8),Math.max(8,innerWidth-448))+'px';current.style.top=top+'px';current.style.width=Math.min(430,innerWidth-16)+'px';current.style.maxHeight=Math.max(100,innerHeight-top-12)+'px';current.style.overflowY='auto';
    try{const {renderCard}=await getModule();if(host!==current)return;controller=renderCard(current,word,context,send,{onClose:()=>{current.remove();if(host===current){host=null;controller=null;}},onRelated:term=>showCard(term,{},position)});}
    catch{root.textContent='扩展载入失败，请刷新网页。';}
  }
  function selected(event){
    if(event.composedPath().includes(host))return;
    if(event.target.closest?.('input,textarea,[contenteditable]:not([contenteditable="false"])'))return;
    const selection=getSelection();if(!selection || selection.isCollapsed || !selection.rangeCount){if(trigger)dismiss();return;}
    const text=selection.toString().trim().replace(/[’‘]/g,"'").replace(/^["'“”([{]+|["'“”.,!?;:)\]}]+$/g,'');
    if(!/^[a-z]+(?:['-][a-z]+)*$/i.test(text) || text.length>80){if(trigger)dismiss();return;}
    const range=selection.getRangeAt(0);const rect=range.getBoundingClientRect();if(!rect.width)return;
    const node=range.commonAncestorContainer.nodeType===Node.TEXT_NODE ? range.commonAncestorContainer.parentElement : range.commonAncestorContainer;
    const block=node.closest?.('p,li,blockquote,h1,h2,h3,h4,td,article') || node;
    const full=(block.textContent || text).replace(/\s+/g,' ').trim();
    const prefix=range.cloneRange();prefix.selectNodeContents(block);prefix.setEnd(range.startContainer,range.startOffset);
    const index=Math.min(full.length,prefix.toString().replace(/\s+/g,' ').trimStart().length);
    // A bounded context excerpt, normally the sentence around the word.
    const boundary=Math.max(full.lastIndexOf('. ',index),full.lastIndexOf('! ',index),full.lastIndexOf('? ',index));
    const start=boundary<0 ? 0 : boundary+2;
    const tail=full.slice(index).search(/[.!?](?:\s|$)/);const end=tail>=0 ? index+tail+1 : Math.min(full.length,index+500);
    const sentence=full.slice(Math.min(start,index),end).slice(0,1000);
    selectionData={word:text.toLowerCase(),context:{sentence,title:document.title,url:location.href},position:{x:rect.left,y:rect.bottom+8}};
    createHost();host.style.left=Math.min(Math.max(rect.left,8),innerWidth-95)+'px';host.style.top=Math.min(rect.bottom+6,innerHeight-40)+'px';
    const style=document.createElement('style');style.textContent='button{font:12px -apple-system,BlinkMacSystemFont,sans-serif;border:1px solid #d0dbca;border-radius:8px;padding:7px 12px;background:#faf9f5;color:#365e45;box-shadow:0 4px 18px #203c2826;cursor:pointer}';
    trigger=document.createElement('button');trigger.textContent='查词 ↗';trigger.type='button';trigger.addEventListener('pointerdown',e=>e.preventDefault());trigger.addEventListener('click',()=>{const data=selectionData;showCard(data.word,data.context,data.position);});root.append(style,trigger);
  }
  document.addEventListener('pointerup',event=>{
    // composedPath is only available during dispatch, before the deferred work.
    if(event.button===0 && !event.composedPath().includes(host))setTimeout(()=>selected(event),0);
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape')dismiss();});
  document.addEventListener('pointerdown',event=>{if(host && !event.composedPath().includes(host))dismiss();});
  addEventListener('scroll',()=>{if(trigger)dismiss();},{passive:true});
})();
