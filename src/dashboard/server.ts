import http from 'node:http';
import { createLogger } from '../logger.js';
import type { Store } from '../store.js';

const log = createLogger('dashboard');

export function startDashboard(store: Store, port: number) {
  const server = http.createServer((req, res) => {
    const url = req.url ?? '/';
    if (url === '/api/status') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          paused: store.paused,
          repliesToday: store.repliesToday(),
          needsHuman: store.needsHumanConversations,
          activity: [...store.activity].reverse().slice(0, 100),
        }),
      );
      return;
    }
    if (url === '/api/pause' && req.method === 'POST') {
      store.setPaused(true);
      res.writeHead(200).end('paused');
      return;
    }
    if (url === '/api/resume' && req.method === 'POST') {
      store.setPaused(false);
      res.writeHead(200).end('resumed');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(PAGE);
  });
  server.listen(port, () => log.info(`Дашборд: http://localhost:${port}`));
  return server;
}

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Yelp Autoresponder</title>
<style>
body{font-family:system-ui,sans-serif;margin:2rem auto;max-width:900px;padding:0 1rem;background:#fafafa;color:#222}
h1{font-size:1.3rem} .row{display:flex;gap:1rem;align-items:center;margin-bottom:1rem}
button{padding:.5rem 1rem;border-radius:8px;border:1px solid #ccc;cursor:pointer;background:#fff}
.badge{padding:.2rem .6rem;border-radius:99px;font-size:.85rem}
.on{background:#d3f4d3}.off{background:#f8d2d2}
table{width:100%;border-collapse:collapse;font-size:.9rem}
td,th{padding:.4rem .6rem;border-bottom:1px solid #eee;text-align:left;vertical-align:top}
.type-reply_sent{color:#0a7d24}.type-handoff{color:#b05a00}.type-error{color:#b00020}
.warn{background:#fff3e0;padding:.7rem 1rem;border-radius:8px;margin-bottom:1rem}
</style></head><body>
<h1>Yelp Autoresponder</h1>
<div class="row">
  <span id="state" class="badge">…</span>
  <span>Ответов сегодня: <b id="count">…</b></span>
  <button onclick="toggle()" id="btn">…</button>
</div>
<div id="needsHuman"></div>
<table><thead><tr><th>Время</th><th>Событие</th><th>Клиент</th><th>Текст</th></tr></thead>
<tbody id="log"></tbody></table>
<script>
let paused=false;
async function refresh(){
  const r=await fetch('/api/status');const d=await r.json();paused=d.paused;
  document.getElementById('state').textContent=paused?'⏸ на паузе':'▶ работает';
  document.getElementById('state').className='badge '+(paused?'off':'on');
  document.getElementById('btn').textContent=paused?'Возобновить':'Пауза';
  document.getElementById('count').textContent=d.repliesToday;
  document.getElementById('needsHuman').innerHTML=d.needsHuman.length
    ?'<div class="warn">⚠️ Требуют человека: '+d.needsHuman.map(c=>c.id+' — '+(c.state.handoffReason||'')).join('; ')+'</div>':'';
  document.getElementById('log').innerHTML=d.activity.map(e=>
    '<tr><td>'+new Date(e.ts).toLocaleTimeString()+'</td><td class="type-'+e.type+'">'+e.type+'</td><td>'+(e.customer||'')+'</td><td>'+(e.text||'')+'</td></tr>').join('');
}
async function toggle(){await fetch(paused?'/api/resume':'/api/pause',{method:'POST'});refresh();}
refresh();setInterval(refresh,5000);
</script></body></html>`;
