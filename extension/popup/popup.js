const $ = (id) => document.getElementById(id);

const LABELS = {
  reply_sent: 'ОТВЕТ',
  handoff: 'ЧЕЛОВЕК',
  error: 'ОШИБКА',
  poll: 'проверка',
  info: 'инфо',
  reply_generated_dry_run: 'черновик',
};

async function send(cmd, extra = {}) {
  return chrome.runtime.sendMessage({ cmd, ...extra });
}

async function refresh() {
  const s = await send('GET_STATE');
  if (!s || !s.ok) return;

  if (!s.setupDone) {
    $('setupScreen').classList.remove('hidden');
    $('mainScreen').classList.add('hidden');
    return;
  }
  $('setupScreen').classList.add('hidden');
  $('mainScreen').classList.remove('hidden');

  // переключатель
  $('toggle').checked = s.enabled;
  $('stateLabel').textContent = s.enabled ? 'Работает' : 'Выключено';
  $('stateSub').textContent = s.enabled
    ? 'Бот проверяет входящие и отвечает клиентам'
    : 'Нажмите, чтобы включить авто-ответы';

  // предупреждение про вкладку
  $('tabWarn').classList.toggle('hidden', !s.enabled || s.hasYelpTab);

  // статистика
  $('repliesToday').textContent = s.repliesToday;
  $('maxPerDay').textContent = s.maxPerDay;

  // требуют человека
  const nh = s.needsHuman ?? [];
  $('needsHuman').classList.toggle('hidden', nh.length === 0);
  $('needsHumanList').innerHTML = nh
    .map(
      (c) =>
        `<div class="nh"><div><b>${esc(c.customer || 'Клиент')}</b>
         <div class="nh-reason">${esc(c.reason || '')}</div></div>
         <button class="btn btn-sm" data-clear="${esc(c.id)}">Ок</button></div>`,
    )
    .join('');
  document.querySelectorAll('[data-clear]').forEach((b) =>
    b.addEventListener('click', async () => {
      await send('CLEAR_HANDOFF', { id: b.dataset.clear });
      refresh();
    }),
  );

  // лента
  const acts = s.activity ?? [];
  $('activity').innerHTML = acts.length
    ? acts
        .map(
          (a) =>
            `<div class="act ${a.type}"><span class="t">${time(a.ts)}</span>
             <span class="body"><span class="tag">${LABELS[a.type] ?? a.type}</span>
             ${a.customer ? ` · ${esc(a.customer)}` : ''}
             ${a.text ? `<br>${esc(a.text)}` : ''}</span></div>`,
        )
        .join('')
    : '<div class="act-empty">Пока пусто. Включите бота и держите вкладку Yelp открытой.</div>';
}

function time(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// обработчики
$('toggle').addEventListener('change', async (e) => {
  await send('SET_ENABLED', { value: e.target.checked });
  refresh();
});
$('setupBtn').addEventListener('click', () => send('OPEN_OPTIONS'));
$('settingsBtn').addEventListener('click', () => send('OPEN_OPTIONS'));
$('openYelpBtn').addEventListener('click', () => send('OPEN_YELP'));
$('openYelp2').addEventListener('click', () => send('OPEN_YELP'));

refresh();
setInterval(refresh, 3000);
