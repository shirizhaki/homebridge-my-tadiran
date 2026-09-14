// Local visual-test harness. Not included in the npm package. No Tadiran calls.
// Run: node test/preview-ui.js, then visit http://127.0.0.1:8765
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const publicDir = new URL('../homebridge-ui/public/', import.meta.url);
const html = fs.readFileSync(new URL('index.html', publicDir), 'utf8');
function render(req, res) {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('Cache-Control', 'no-store');
  if (['/settings.css', '/settings.js'].includes(url.pathname)) {
    res.setHeader('Content-Type', url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript');
    return res.end(fs.readFileSync(new URL(url.pathname.slice(1), publicDir)));
  }
  const dark = url.searchParams.get('theme') === 'dark';
  const mobile = url.searchParams.has('mobile');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (url.pathname === '/frame') {
    return res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;padding:0;background:${dark ? '#171e23' : '#fff'}}</style></head><body>
      <script>
        let draft = [{platform:'MyTadiran',name:'My Tadiran',phone:'+972500000000',pollInterval:30,exposeDryMode:true,exposeFanOnly:false,exposeFanSpeedControl:true,debugLogs:false,_bridge:{username:'AA:BB:CC:DD:EE:FF',port:12345}}];
        let ready;
        window.homebridge = {
          plugin: {installedVersion:'0.1.7'},
          addEventListener: (event, callback) => { if(event==='ready') ready=callback; },
          hideSchemaForm: () => {},
          userCurrentLightingMode: async () => '${dark ? 'dark' : 'light'}',
          getPluginConfig: async () => structuredClone(draft),
          updatePluginConfig: async config => { draft=structuredClone(config); parent.document.getElementById('draft').textContent=JSON.stringify(draft,null,2); },
          savePluginConfig: async () => { parent.document.getElementById('result').textContent='Saved (test only)'; },
          enableSaveButton: () => { parent.document.getElementById('save').disabled=false; },
          disableSaveButton: () => { parent.document.getElementById('save').disabled=true; },
          request: async endpoint => { if(endpoint==='/auth-status') return {hasSavedLogin:true}; parent.document.getElementById('request').textContent=endpoint; return {ok:true}; },
          showSpinner: () => {}, hideSpinner: () => {},
          closeSettings: () => { parent.document.getElementById('result').textContent='Settings closed (test only)'; },
          toast: {success: message => { parent.document.getElementById('result').textContent=message; },error: message => { parent.document.getElementById('result').textContent=message; }},
        };
      </script>${html}<script>ready(); new ResizeObserver(()=>{parent.document.getElementById('preview').style.height=document.body.scrollHeight+'px';}).observe(document.body);</script></body></html>`);
  }
  res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>My Tadiran — local UI preview</title><style>
    body{margin:0;background:${dark ? '#101519' : '#edf1f4'};color:${dark ? '#edf3f6' : '#25313b'};font:14px system-ui}main{width:${mobile ? '390' : '760'}px;max-width:100%;margin:25px auto;background:${dark ? '#171e23' : '#fff'};border-radius:16px;overflow:hidden;box-shadow:0 12px 50px #0001}nav{padding:12px;text-align:center}a{color:${dark ? '#79d9df' : '#076f7b'};margin:0 8px}.modal-heading{padding:16px 24px;border-bottom:1px solid #71818c44;font-size:13px}.frame-wrap{padding:16px}iframe{border:0;width:100%;display:block}.actions{padding:15px 24px;border-top:1px solid #71818c44;text-align:right}button{font:inherit;padding:9px 24px;border:0;border-radius:8px;background:#6336bd;color:white}button:disabled{opacity:.4}details{max-width:760px;margin:20px auto;padding:10px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}#result,#request{text-align:center}
    </style></head><body><nav>Local preview · simulated Homebridge host<br><a href="/?theme=light">Light</a><a href="/?theme=dark">Dark</a><a href="/?mobile=1&theme=light">Mobile light</a><a href="/?mobile=1&theme=dark">Mobile dark</a></nav><main><div class="modal-heading">My Tadiran · Settings</div><div class="frame-wrap"><iframe id="preview" title="Plugin settings" src="/frame?theme=${dark ? 'dark' : 'light'}"></iframe></div><div class="actions"><button id="save" disabled onclick="document.getElementById('preview').contentWindow.homebridge.savePluginConfig()">Save</button></div></main><p id="result"></p><p id="request">No authentication requests</p><details><summary>Test-only staged configuration</summary><pre id="draft">No changes</pre></details></body></html>`);
}

if (process.argv[2] === '--export') {
  const destination = path.resolve(process.argv[3]);
  fs.mkdirSync(destination, { recursive: true });
  for (const theme of ['light', 'dark']) {
    for (const [route, name] of [[`/?theme=${theme}`, `${theme}.html`], [`/?theme=${theme}&mobile=1`, `mobile-${theme}.html`], [`/frame?theme=${theme}`, `frame-${theme}.html`]]) {
      render({ url: route }, { setHeader() {}, end(content) {
        const standalone = content.replaceAll(`src="/frame?theme=${theme}"`, `src="frame-${theme}.html"`)
          .replaceAll('href="/?theme=light"', 'href="light.html"').replaceAll('href="/?theme=dark"', 'href="dark.html"')
          .replaceAll('href="/?mobile=1&theme=light"', 'href="mobile-light.html"').replaceAll('href="/?mobile=1&theme=dark"', 'href="mobile-dark.html"');
        fs.writeFileSync(path.join(destination, name), standalone);
      } });
    }
  }
  for (const name of ['settings.css', 'settings.js']) fs.copyFileSync(new URL(name, publicDir), path.join(destination, name));
  console.log(`Exported local-only preview to ${destination}`);
} else {
  http.createServer(render).listen(8765, '127.0.0.1', () => console.log('Local UI preview: http://127.0.0.1:8765'));
}
