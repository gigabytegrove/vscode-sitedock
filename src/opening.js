'use strict';

const path=require('node:path');

// VS Code ships these media editor identifiers. Unlike showTextDocument(),
// vscode.openWith() preserves the binary resource and displays an actual preview.
const MEDIA_EDITORS=new Map([
  ['.png','imagePreview.previewEditor'],['.jpg','imagePreview.previewEditor'],
  ['.jpeg','imagePreview.previewEditor'],['.jpe','imagePreview.previewEditor'],
  ['.bmp','imagePreview.previewEditor'],['.gif','imagePreview.previewEditor'],
  ['.ico','imagePreview.previewEditor'],['.webp','imagePreview.previewEditor'],
  ['.avif','imagePreview.previewEditor'],['.svg','imagePreview.previewEditor'],
  ['.mp3','vscode.audioPreview'],['.wav','vscode.audioPreview'],
  ['.ogg','vscode.audioPreview'],['.oga','vscode.audioPreview'],
  ['.mp4','vscode.videoPreview'],['.webm','vscode.videoPreview'],
]);
const MIME=new Map([
  ['.png','image/png'],['.jpg','image/jpeg'],['.jpeg','image/jpeg'],
  ['.jpe','image/jpeg'],['.bmp','image/bmp'],['.gif','image/gif'],
  ['.ico','image/x-icon'],['.webp','image/webp'],['.avif','image/avif'],
  ['.svg','image/svg+xml']
]);
const DANGEROUS_EXTENSIONS=new Set(['.exe','.com','.bat','.cmd','.ps1','.psm1','.vbs','.vbe','.js','.jse','.wsf','.wsh','.msi','.msp','.msc','.scr','.hta','.lnk','.url','.jar','.reg']);
const PREVIEW_LIMIT=12*1024*1024;
const extensionOf=name=>path.posix.extname(name||'').toLowerCase();
const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function isOpenable(node) {return Boolean(node&&node.kind==='entry'&&node.type!=='directory'&&!node.broken&&!node.unresolved&&!node.externalBlocked);}

async function fallbackImagePreview(vscode,uri,name){
  const stat=await vscode.workspace.fs.stat(uri);
  if(stat.size>PREVIEW_LIMIT)throw new Error(`This image is too large for the fallback preview (${Math.ceil(stat.size/1048576)} MB). Use Open in Desktop App, or try the built-in image preview.`);
  const bytes=await vscode.workspace.fs.readFile(uri);
  if(bytes.byteLength>PREVIEW_LIMIT)throw new Error('Image exceeds the maximum fallback preview size (12 MB).');
  const mime=MIME.get(extensionOf(name));
  if(!mime)throw new Error('No image preview available for this file type.');
  const data=Buffer.from(bytes).toString('base64');
  const panel=vscode.window.createWebviewPanel('sitedock.imagePreview',`Preview: ${name}`,vscode.ViewColumn.Active,{enableScripts:false,retainContextWhenHidden:false,enableFindWidget:false});
  panel.webview.html=`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline';"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(name)}</title><style>html,body{margin:0;width:100%;height:100%;background:var(--vscode-editor-background);color:var(--vscode-editor-foreground);font-family:var(--vscode-font-family)}main{display:flex;align-items:center;justify-content:center;box-sizing:border-box;height:100%;padding:16px;overflow:auto}img{max-width:100%;max-height:100%;object-fit:contain}img:hover{cursor:zoom-in}</style></head><body><main><img src="data:${mime};base64,${data}" alt="${escapeHtml(name)}" /></main></body></html>`;
  return panel;
}

async function openRemoteFile(vscode,uri,name){
  const editor=MEDIA_EDITORS.get(extensionOf(name));
  if(editor){
    try {
      // Use the native media editor, including its zoom and playback controls.
      return await vscode.commands.executeCommand('vscode.openWith',uri,editor,{preview:false});
    }catch(err){
      if(editor==='imagePreview.previewEditor')return fallbackImagePreview(vscode,uri,name);
      throw new Error(`VS Code could not open ${name} in its media player: ${err?.message||err}. Try Open in Desktop App.`,{cause:err});
    }
  }
  // Delegate to VS Code's file/editor associations, not a forced text document.
  return vscode.commands.executeCommand('vscode.open',uri,{preview:false});
}

// Explicit local copy: external programs cannot edit a sitedock:// resource.
// No automatic uploads or background monitoring: desktop modifications stay local.
async function openInDesktopApp(vscode,uri,name){
  if(!vscode.env || typeof vscode.env.openExternal!=='function')throw new Error('Desktop application launching is not available in this VS Code host.');
  const safeName=path.posix.basename(name||uri.path);
  const ext=extensionOf(safeName);
  if(DANGEROUS_EXTENSIONS.has(ext)){
    const consent=await vscode.window.showWarningMessage(`Opening “${safeName}” in a desktop application could execute code from the remote server. Continue?`,{modal:true,detail:'Only open executable or script files you trust.'},'Continue');
    if(consent!=='Continue')return {cancelled:true};
  }
  const suggested=vscode.Uri.file(path.join(require('node:os').homedir(),safeName));
  const local=await vscode.window.showSaveDialog({title:`Save and open ${safeName} in your default desktop application`,saveLabel:'Save & Open',defaultUri:suggested});
  if(!local)return {cancelled:true};
  if(local.scheme!=='file')throw new Error('To open in a Windows/macOS/Linux application, select a local folder, not a remote workspace.');
  let exists=false;
  try{await vscode.workspace.fs.stat(local);exists=true;}
  catch(err){if(err?.code!=='FileNotFound'&&err?.code!=='ENOENT')throw err;}
  if(exists){
    const confirm=await vscode.window.showWarningMessage(`Replace the local file “${path.basename(local.fsPath||local.path)}”?`,{modal:true,detail:'This affects only the local copy, not the server.'},'Replace Local File');
    if(confirm!=='Replace Local File')return {cancelled:true};
  }
  // Never treat this local file as a remote live-editing session.
  const bytes=await vscode.workspace.fs.readFile(uri);
  await vscode.workspace.fs.writeFile(local,bytes);
  const opened=await vscode.env.openExternal(local);
  if(!opened)throw new Error(`Downloaded to ${local.fsPath||local.path}, but Windows did not open an associated application. Open the file manually or choose an app in Windows.`);
  await vscode.window.showInformationMessage(`Opened a local copy of “${safeName}”. Changes made in the desktop app are NOT automatically uploaded. Use SiteDock: Upload Files to publish them.`);
  return {opened:true,local};
}
module.exports={MEDIA_EDITORS,MIME,PREVIEW_LIMIT,DANGEROUS_EXTENSIONS,extensionOf,isOpenable,openRemoteFile,openInDesktopApp,fallbackImagePreview};
