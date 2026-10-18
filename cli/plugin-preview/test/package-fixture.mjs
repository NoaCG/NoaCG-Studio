import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// A source package in the normal exported layout, independent of the fixed phase-1 draft.
export async function writePackage(root) {
  for (const dir of ['css', 'js', 'images', 'fonts']) await mkdir(path.join(root, dir), { recursive: true });
  const fields = [
    { field: 'headline', ftype: 'textfield', title: 'Headline', value: 'Studio report' },
    { field: 'score', ftype: 'number', title: 'Score', value: '2' },
    { field: 'edition', ftype: 'dropdown', title: 'Edition', value: 'LIVE', items: [{ text: 'Live', value: 'LIVE' }, { text: 'Replay', value: 'REPLAY' }] },
    { field: 'showBadge', ftype: 'checkbox', title: 'Show badge', value: '1' },
    { field: 'accent', ftype: 'color', title: 'Accent', value: '#f6a623' },
    { field: 'notes', ftype: 'textarea', title: 'Notes', value: 'First line\nSecond line' },
  ];
  const animation = { version: 2, root: '#panel', speed: 1, steps: [{ name: 'In', duration: 0, ease: 'none', layers: {} }, { name: 'Out', duration: 0, ease: 'none', layers: {} }], machine: {
    groups: [{ id: 'main', initial: 'off', defaultPath: ['live', 'off'], states: [{ id: 'off' }, { id: 'live' }], transitions: [{ from: 'live', to: 'live', trigger: 'operator', event: 'goal' }] }],
    controls: [{ event: 'goal', label: 'Goal +1', adjust: { score: 1 } }],
  } };
  const files = {
    'square.html': `<!doctype html><html><head><meta name="noacg-project-format" content="width=1080;height=1080;fps=25"><title>Square rehearsal</title><link href="./css/template.css" rel="stylesheet"><script>globalThis.__NOACG_PREVIEW_NODE_PROBE=true;window.SPXGCTemplateDefinition=${JSON.stringify({ DataFields: fields })};</script><script src="js/template.js"></script></head><body><section id="panel" data-preview-target="Panel"><img id="badge" src="images/badge.svg" alt=""><p id="edition">LIVE</p><h1 id="headline">Studio report</h1><p id="score">2</p><p id="notes">First line<br>Second line</p><div id="unmapped">Unmapped artwork</div></section></body></html>`,
    'css/template.css': '@import "./type.css"; *{box-sizing:border-box}html,body{margin:0;width:1080px;height:1080px;overflow:hidden;font-family:Trial, sans-serif;color:#fff;background:transparent}#panel{position:absolute;left:100px;top:140px;width:880px;padding:60px;background:#111a2a;border-left:12px solid #f6a623;opacity:0}#badge{width:68px;height:68px;float:right}h1{font-size:72px;line-height:1.1;margin:30px 0}#edition{font-size:24px;color:#f6a623;letter-spacing:.16em}#score{font-size:100px;margin:25px 0}#notes{white-space:pre-line;font-size:26px;color:#bfcadb}#unmapped{margin-top:30px;font-size:20px;color:#bfcadb}',
    'css/type.css': '@font-face{font-family:Trial;src:url("../fonts/inter.woff2") format("woff2");font-weight:100 900}',
    'js/template.js': `var NOACG_ANIM = ${JSON.stringify(animation)};
      let state='off';
      window.play=()=>{state='live';document.getElementById('panel').style.opacity='1'};
      window.stop=()=>{state='off';document.getElementById('panel').style.opacity='0'};
      window.next=()=>{document.getElementById('edition').textContent='NEXT'};
      window.update=(json)=>{const data=typeof json==='string'?JSON.parse(json):json;for(const key of ['headline','score','edition','notes'])if(data[key]!==undefined)document.getElementById(key).textContent=data[key];if(data.showBadge!==undefined)document.getElementById('badge').style.visibility=data.showBadge==='1'?'visible':'hidden';if(data.accent)document.getElementById('panel').style.borderColor=data.accent};
      window.noacgDispatch=(event,payload)=>{if(state!=='live')return false;if(event==='goal'){window.update(payload);return true}return false};
      window.noacgMachineState=()=>({groups:{main:state}});`,
  };
  for (const [name, text] of Object.entries(files)) await writeFile(path.join(root, name), text);
  await writeFile(path.join(root, 'images/badge.svg'), await readFile(new URL('../fixture/badge.svg', import.meta.url)));
  await writeFile(path.join(root, 'fonts/inter.woff2'), await readFile(new URL('../../../public/fonts/inter.woff2', import.meta.url)));
}
