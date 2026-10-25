// Save the inn canvas itself, preserving its transparent WebGL background.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9235;
const profile = mkdtempSync(join(tmpdir(), 'inn-reference-'));
const mode = ['floor','walls'].includes(process.argv[2]) ? process.argv[2] : 'reference';
const output = resolve(mode === 'floor' ? 'docs/blueprints/inn_floor_only_v1.png' : mode === 'walls' ? 'docs/blueprints/inn_wall_overlay_v1.png' : 'docs/blueprints/inn_props_reference_v1.png');
const query = mode === 'floor' ? 'floorOnly=1' : mode === 'walls' ? 'wallOnly=1' : 'reference=1';
const url = `http://127.0.0.1:8766/tools/inn_furniture_graybox.html?${query}&capture=1`;
const browser = spawn(chrome, [
  '--headless=new', '--disable-gpu-sandbox', '--disable-dev-shm-usage',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--window-size=1672,941', url,
], { stdio: 'ignore', windowsHide: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
try {
  let tab;
  for (let i = 0; i < 80; i++) {
    try {
      const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      tab = tabs.find(t => t.type === 'page' && t.url.includes('inn_furniture_graybox.html'));
      if (tab) break;
    } catch { /* Chrome is starting. */ }
    await sleep(250);
  }
  if (!tab) throw new Error('Inn tab did not open');
  const socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { socket.onopen = ok; socket.onerror = fail; });
  let nextId = 0;
  const command = (method, params) => new Promise((ok, fail) => {
    const id = ++nextId;
    const timer = setTimeout(() => fail(new Error('CDP evaluation timed out')), 10000);
    const handler = event => {
      const packet = JSON.parse(event.data);
      if (packet.id !== id) return;
      socket.removeEventListener('message', handler);
      clearTimeout(timer);
      if (packet.error) fail(new Error(packet.error.message));
      else ok(packet.result);
    };
    socket.addEventListener('message', handler);
    socket.send(JSON.stringify({id, method, params}));
  });
  const evaluate = async expression => (await command('Runtime.evaluate', {expression, returnByValue:true})).result?.value;
  await command('Emulation.setDeviceMetricsOverride', {width:1672,height:941,deviceScaleFactor:1,mobile:false});
  for (let i = 0; i < 80 && !(await evaluate('window.innFurnitureReady === true')); i++) await sleep(250);
  if (!(await evaluate('window.innFurnitureReady === true'))) throw new Error('Inn scene did not render');
  const png = await evaluate('document.querySelector("#view").toDataURL("image/png")');
  const half = await evaluate('window.innCameraHalf');
  if (!png?.startsWith('data:image/png;base64,')) throw new Error('Canvas PNG export failed');
  writeFileSync(output, Buffer.from(png.split(',')[1], 'base64'));
  socket.close();
  process.stdout.write(`${output} cameraHalf=${half}\n`);
} finally {
  browser.kill();
}
