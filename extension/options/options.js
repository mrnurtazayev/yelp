const $ = (id) => document.getElementById(id);
const steps = [...document.querySelectorAll('.step')];
let cur = 0;

const TONES = {
  friendly:
    'Friendly, brief, and warm. Writes like a real busy business owner texting from a phone: short sentences, one emoji at most, always asks a clarifying question to move the deal forward.',
  pro: 'Professional, concise, and confident. Clear and to the point, no fluff, no emoji. Always moves the conversation toward booking or an estimate.',
  casual:
    'Casual and easy-going, like texting a friend. Short and relaxed, contractions are fine. Still helpful and pushes gently toward next steps.',
};

// ---- загрузка сохранённого ----
async function loadInto() {
  const { config } = await chrome.storage.local.get('config');
  const c = config ?? {};
  const b = c.business ?? {};
  const p = c.persona ?? {};
  const beh = c.behavior ?? {};
  set('apiKey', c.apiKey);
  set('model', c.model, 'claude-opus-4-8');
  set('openaiBaseUrl', c.openaiBaseUrl, 'https://api.openai.com/v1');
  set('openaiKey', c.openaiKey);
  set('openaiModel', c.openaiModel, 'gpt-4o');
  if (c.provider === 'openai') document.querySelector('input[value="openai"]').checked = true;
  set('bizName', b.name);
  set('bizCategory', b.category);
  set('bizCity', b.city);
  set('bizPhone', b.phone);
  set('bizLang', b.language, 'English');
  set('personaName', p.name);
  set('tone', p.tone, TONES.friendly);
  set('facts', (c.facts ?? []).join('\n'));
  set('rules', (c.rules ?? [
    'Never promise an exact final price — only starting rates and a free estimate.',
    'Never say you are an AI or an assistant.',
  ]).join('\n'));
  set('handoffReply', c.handoffReply, 'Thanks for reaching out! Let me check the details and get back to you shortly.');
  if (beh.activeFrom) set('activeFrom', beh.activeFrom);
  if (beh.activeTo) set('activeTo', beh.activeTo);
  if (beh.maxRepliesPerDay) { $('maxPerDay').value = beh.maxRepliesPerDay; $('maxLabel').textContent = beh.maxRepliesPerDay; }
  if (beh.delayMinSec) set('delayMin', beh.delayMinSec);
  if (beh.delayMaxSec) set('delayMax', beh.delayMaxSec);
  if (beh.pollMinutes) set('pollMinutes', beh.pollMinutes);
  toggleProviderFields();
  syncToneChips();
}
function set(id, val, def) {
  const el = $(id);
  if (!el) return;
  if (val != null && val !== '') el.value = val;
  else if (def != null) el.value = def;
}

// ---- сбор конфига ----
function collect() {
  const provider = document.querySelector('input[name="provider"]:checked').value;
  const handoffTriggers = [...document.querySelectorAll('#handoffChecks input:checked')].map((c) => c.value);
  return {
    provider,
    apiKey: $('apiKey').value.trim(),
    model: $('model').value.trim() || 'claude-opus-4-8',
    openaiBaseUrl: $('openaiBaseUrl').value.trim(),
    openaiKey: $('openaiKey').value.trim(),
    openaiModel: $('openaiModel').value.trim() || 'gpt-4o',
    business: {
      name: $('bizName').value.trim(),
      category: $('bizCategory').value.trim(),
      city: $('bizCity').value.trim(),
      phone: $('bizPhone').value.trim(),
      language: $('bizLang').value.trim() || 'English',
    },
    persona: { name: $('personaName').value.trim(), tone: $('tone').value.trim() || TONES.friendly },
    facts: linesOf('facts'),
    rules: linesOf('rules'),
    handoffTriggers,
    handoffReply: $('handoffReply').value.trim(),
    behavior: {
      activeFrom: $('activeFrom').value || '08:00',
      activeTo: $('activeTo').value || '21:00',
      maxRepliesPerDay: Number($('maxPerDay').value) || 60,
      delayMinSec: Number($('delayMin').value) || 45,
      delayMaxSec: Number($('delayMax').value) || 240,
      typingMsPerChar: 55,
      pollMinutes: Math.max(1, Number($('pollMinutes').value) || 2),
      cooldownSec: 300,
    },
  };
}
function linesOf(id) {
  return $(id).value.split('\n').map((s) => s.trim()).filter(Boolean);
}
async function save(extra = {}) {
  const { config } = await chrome.storage.local.get('config');
  await chrome.storage.local.set({ config: { ...(config ?? {}), ...collect(), ...extra } });
}

// ---- навигация ----
function show(i) {
  cur = Math.max(0, Math.min(steps.length - 1, i));
  steps.forEach((s, idx) => s.classList.toggle('active', idx === cur));
  $('bar').style.width = `${((cur + 1) / steps.length) * 100}%`;
  $('backBtn').style.visibility = cur === 0 ? 'hidden' : 'visible';
  $('nextBtn').textContent = cur === steps.length - 1 ? 'Закрыть' : 'Далее →';
  renderDots();
  window.scrollTo(0, 0);
}
function renderDots() {
  $('dots').innerHTML = steps.map((_, i) => `<div class="dot ${i === cur ? 'active' : ''}"></div>`).join('');
}

$('nextBtn').addEventListener('click', async () => {
  // валидация ключевых шагов
  if (cur === 1 && !hasKey()) return flashTest('Вставьте API-ключ, чтобы продолжить', false);
  if (cur === 2 && !$('bizName').value.trim()) return alert('Укажите название бизнеса');
  if (cur === 3 && !$('personaName').value.trim()) return alert('Укажите ваше имя');

  await save(cur === steps.length - 1 ? { setupDone: true } : {});
  if (cur === steps.length - 1) {
    window.close();
    return;
  }
  show(cur + 1);
});
$('backBtn').addEventListener('click', () => show(cur - 1));

function hasKey() {
  const provider = document.querySelector('input[name="provider"]:checked').value;
  return provider === 'anthropic' ? $('apiKey').value.trim() : $('openaiKey').value.trim();
}

// ---- провайдер ----
document.querySelectorAll('input[name="provider"]').forEach((r) =>
  r.addEventListener('change', toggleProviderFields),
);
function toggleProviderFields() {
  const p = document.querySelector('input[name="provider"]:checked').value;
  $('anthropicFields').classList.toggle('hidden', p !== 'anthropic');
  $('openaiFields').classList.toggle('hidden', p !== 'openai');
}

// ---- тон ----
$('toneChips').addEventListener('click', (e) => {
  const btn = e.target.closest('.chip');
  if (!btn) return;
  $('tone').value = TONES[btn.dataset.tone];
  syncToneChips();
});
$('tone').addEventListener('input', syncToneChips);
function syncToneChips() {
  const v = $('tone').value;
  document.querySelectorAll('#toneChips .chip').forEach((c) =>
    c.classList.toggle('active', TONES[c.dataset.tone] === v),
  );
}

// ---- слайдер лимита ----
$('maxPerDay').addEventListener('input', (e) => ($('maxLabel').textContent = e.target.value));

// ---- проверка подключения ----
$('testBtn').addEventListener('click', async () => {
  if (!hasKey()) return flashTest('Сначала вставьте API-ключ', false);
  flashTest('Проверяю…', null);
  await save();
  try {
    const r = await chrome.runtime.sendMessage({ cmd: 'TEST_LLM' });
    if (r?.ok) flashTest(`✅ Работает! Пример ответа: «${r.reply}»`, true);
    else flashTest(`❌ ${r?.error || 'Не удалось'}`, false);
  } catch (e) {
    flashTest(`❌ ${e.message}`, false);
  }
});
function flashTest(text, ok) {
  const el = $('testResult');
  el.textContent = text;
  el.className = 'test-result' + (ok === true ? ' ok' : ok === false ? ' err' : '');
}

// ---- финал ----
$('enableBtn').addEventListener('click', async () => {
  await save({ setupDone: true, enabled: true });
  await chrome.runtime.sendMessage({ cmd: 'SET_ENABLED', value: true });
  $('enabledMsg').classList.remove('hidden');
  $('enableBtn').textContent = '✅ Включено';
});
$('openYelpBtn').addEventListener('click', () => chrome.runtime.sendMessage({ cmd: 'OPEN_YELP' }));

// автосохранение при уходе с любого шага (на всякий случай)
window.addEventListener('beforeunload', () => { save(); });

loadInto().then(() => show(0));
