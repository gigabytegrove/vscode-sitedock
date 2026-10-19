'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {openRemoteFile,openInDesktopApp,MEDIA_EDITORS,extensionOf}=require('../src/opening');

const siteUri={scheme:'sitedock',authority:'site1',path:'/images/photo.png'};
function mock(){
 const calls=[], dialogs=[], files=new Map();
 let validImage=Buffer.from([137,80,78,71,13,10,26,10]);
 const v={
   Uri:{file:p=>({scheme:'file',path:p,fsPath:p})},
   ViewColumn:{Active:1},
   commands:{executeCommand:async(...args)=>{calls.push(args);return 'ok';}},
   workspace:{fs:{
     stat:async u=>{if(u.scheme==='sitedock')return {size:validImage.length};if(files.has(u.fsPath))return {size:files.get(u.fsPath).length};const e=new Error('missing');e.code='FileNotFound';throw e;},
     readFile:async u=>{calls.push(['readFile',u]);return validImage;},
     writeFile:async(u,data)=>{calls.push(['writeFile',u,data]);files.set(u.fsPath,Buffer.from(data));}
   }},
   window:{
     createWebviewPanel:(id,title,view,opts)=>{const p={webview:{html:''},dispose(){}};dialogs.push({id,title,view,opts,p});return p;},
     showSaveDialog:async()=>({scheme:'file',path:'/tmp/image.png',fsPath:'/tmp/image.png'}),
     showWarningMessage:async()=>undefined,
     showInformationMessage:async(...args)=>{calls.push(['notice',...args]);},
   },
   env:{openExternal:async uri=>{calls.push(['external',uri]);return true;}}
 };
 return {v,calls,dialogs,files,setImage:b=>validImage=Buffer.from(b)};
}

test('built-in image viewer selected for raster and vector formats, ignoring case',async()=>{
 for(const name of ['x.png','x.JPG','x.JPeG','x.gif','x.webp','x.avif','x.svg','x.ico','x.bmp']){
   const {v,calls}=mock(); await openRemoteFile(v,siteUri,name);
   assert.deepEqual(calls[0],['vscode.openWith',siteUri,'imagePreview.previewEditor',{preview:false}],name);
   assert(!calls.some(x=>x[0]==='readFile'),'built-in view should load through FileSystemProvider');
 }
});
test('audio and video select native media viewers',async()=>{
 for(const [f,editor] of [['clip.mp4','vscode.videoPreview'],['song.mp3','vscode.audioPreview'],['clip.WEBM','vscode.videoPreview'],['sound.ogg','vscode.audioPreview']]){
   const {v,calls}=mock();await openRemoteFile(v,siteUri,f);assert.equal(calls[0][2],editor);
 }
});
test('text and associated non-media files delegate to VS Code rather than force text',async()=>{
 for(const name of ['index.php','readme.md','settings.json','report.pdf','archive.zip']){
   const {v,calls}=mock();await openRemoteFile(v,siteUri,name);assert.deepEqual(calls[0],['vscode.open',siteUri,{preview:false}]);
 }
});
test('image fallback encodes binary as data URI, blocks scripts, and escapes HTML metadata',async()=>{
 const {v,dialogs}=mock();v.commands.executeCommand=async()=>{throw new Error('builtin preview disabled');};
 await openRemoteFile(v,siteUri,'bad<img>.png');
 assert.equal(dialogs.length,1);
 const html=dialogs[0].p.webview.html;
 assert.match(html, /default-src 'none'/);
 assert.match(html, /img-src data:/);
 assert.match(html,/data:image\/png;base64,iVBORw0KGgo=/);
 assert.match(html,/bad&lt;img&gt;.png/);
 assert.doesNotMatch(html,/<script/i);
 assert.equal(dialogs[0].opts.enableScripts,false);
});
test('fallback rejects huge images before allocating full transfer',async()=>{
 const {v}=mock();v.commands.executeCommand=async()=>{throw Error('image unavailable');};
 v.workspace.fs.stat=async()=>({size:13*1024*1024});
 v.workspace.fs.readFile=async()=>{throw Error('should not read');};
 await assert.rejects(openRemoteFile(v,siteUri,'image.png'),/too large/);
});
test('external open saves a local copy and opens via OS association without uploading',async()=>{
 const {v,calls,files}=mock();
 const result=await openInDesktopApp(v,siteUri,'photo.png');
 assert.equal(result.opened,true);
 assert.equal(files.get('/tmp/image.png').toString('hex'),'89504e470d0a1a0a');
 assert.deepEqual(calls.filter(x=>x[0]==='external')[0][1],{scheme:'file',path:'/tmp/image.png',fsPath:'/tmp/image.png'});
 assert.equal(calls.filter(x=>x[0]==='writeFile').length,1);
 assert.equal(calls.filter(x=>x[0]==='readFile').length,1);
});
test('external open requires consent for scripts, declines without reading',async()=>{
 const {v,calls}=mock();const result=await openInDesktopApp(v,siteUri,'install.ps1');
 assert.deepEqual(result,{cancelled:true});assert.deepEqual(calls,[]);
});
test('cancel external save picker without reading remote resource',async()=>{
 const {v,calls}=mock();v.window.showSaveDialog=async()=>undefined;
 assert.deepEqual(await openInDesktopApp(v,siteUri,'photo.png'),{cancelled:true});assert.deepEqual(calls,[]);
});
test('refuse overwrite existing desktop file without specific confirmation',async()=>{
 const {v,calls,files}=mock();files.set('/tmp/image.png',Buffer.from('priceless local'));
 assert.deepEqual(await openInDesktopApp(v,siteUri,'photo.png'),{cancelled:true});
 assert.equal(files.get('/tmp/image.png').toString(),'priceless local');assert.deepEqual(calls,[]);
});
test('external app launch failure preserves saved copy with clear error',async()=>{
 const {v,files}=mock();v.env.openExternal=async()=>false;
 await assert.rejects(openInDesktopApp(v,siteUri,'photo.png'),/Downloaded to/);
 assert(files.has('/tmp/image.png'));
});
test('extension detection and registrations are deterministic',()=>{
 assert.equal(extensionOf('IMAGE.JPEG'),'.jpeg');
 assert.equal(extensionOf('noextension'),'');
 assert.equal(MEDIA_EDITORS.get('.svg'),'imagePreview.previewEditor');
});
