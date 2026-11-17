import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const source=(await fs.readFile(path.join(root,'docs/word-memory-demo-poster.png'))).toString('base64');
const browser=await chromium.launch({headless:true,executablePath:process.env.WORD_MEMORY_BROWSER || undefined});
try{
  const page=await browser.newPage();
  const data=await page.evaluate(async source=>{
    const image=new Image();image.src='data:image/png;base64,'+source;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
    const c=canvas.getContext('2d');c.drawImage(image,0,0);
    c.fillStyle='rgba(25,45,34,0.12)';c.fillRect(0,0,canvas.width,canvas.height);
    const x=canvas.width/2,y=canvas.height*0.44;
    c.save();c.shadowColor='rgba(15,35,24,0.35)';c.shadowBlur=60;c.shadowOffsetY=14;
    c.beginPath();c.arc(x,y,150,0,Math.PI*2);c.fillStyle='#365e45';c.fill();c.restore();
    c.lineWidth=8;c.strokeStyle='#faf9f5';c.stroke();
    c.beginPath();c.moveTo(x-38,y-68);c.lineTo(x+72,y);c.lineTo(x-38,y+68);c.closePath();c.fillStyle='#ffffff';c.fill();
    c.fillStyle='#203d30';c.beginPath();c.roundRect(x-360,y+196,720,180,36);c.fill();
    c.textAlign='center';c.textBaseline='middle';c.fillStyle='#ffffff';c.font='600 64px -apple-system, "PingFang SC", sans-serif';c.fillText('点击观看演示',x,y+255);
    c.fillStyle='#c8d8bd';c.font='40px -apple-system, "PingFang SC", sans-serif';c.fillText('约 40 秒 · 支持全屏',x,y+326);
    return canvas.toDataURL('image/png').split(',')[1];
  },source);
  await fs.writeFile(path.join(root,'docs/word-memory-demo-cover.png'),Buffer.from(data,'base64'));
  console.log('Created docs/word-memory-demo-cover.png');
}finally{await browser.close();}
