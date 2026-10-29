// Offline rendering of the ACTUAL CharacterSprite and lightning material.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import http from 'node:http';
const require=createRequire('C:/Users/tmsta/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/preview.cjs');
const {chromium}=require('playwright'),sharp=require('sharp');
const shadow=process.argv.includes('--shadow');
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,shadow?'look_tests/shadow_blade_preview':'look_tests/kuroda_sprite_preview/crimson_lightning');
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  const types={'.js':'text/javascript','.html':'text/html','.json':'application/json','.png':'image/png'};
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
  const stream=fs.createReadStream(file);stream.on('error',()=>res.writeHead(404).end());stream.pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({args:['--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--allow-file-access-from-files']});
try{
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.error(m.text());}});
  if(process.env.THREE_LOCAL_DIR)await page.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\//,r=>r.fulfill({path:path.join(process.env.THREE_LOCAL_DIR,r.request().url().replace(/^.*three@[^/]+\//,'')),contentType:'text/javascript'}));
  await page.goto(`http://127.0.0.1:${server.address().port}/look_tests/${shadow?'shadow_blade_preview':'weapon_lightning_preview'}.html?capture`);
  await page.waitForFunction(()=>window.weaponPreview?.ready,null,{timeout:60000});
  const frames=[];
  for(let i=0;i<(shadow?72:48);i++){
    const url=await page.evaluate(t=>window.weaponPreview.frame(t),(i+1)/16);
    const frame=Buffer.from(url.split(',')[1],'base64');frames.push(frame);
    if(i===30)fs.writeFileSync(path.join(out,'thrust.png'),frame);
    if([0,23,27,31].includes(i))fs.writeFileSync(path.join(out,`pose-${i}.png`),frame);
  }
  if(errors.length)throw Error(errors.join('\n'));
  await sharp(frames,{join:{animated:true}}).gif({delay:63,loop:0}).toFile(path.join(out,shadow?'shadow_blade.gif':'crimson_lightning.gif'));
  console.log(`Actual game-renderer preview: ${out}; no renderer errors`);
}finally{await browser.close();server.close();}
