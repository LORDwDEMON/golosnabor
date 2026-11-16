// Панель управления: показывает состояние, переключает настройки.
const PRESETS = ['ScrollLock', 'Capslock', 'Control+Alt+Space', 'F9'];
const MODES = { toggle: 'Переключать хоткеем', hold: 'Удерживать хоткей' };

const $ = (id) => document.getElementById(id);
let state = null;

function render(next) {
  state = next;
  const s = next.settings;
  $('hotkey').textContent = prettyKey(s.hotkey);
  $('mode').textContent = MODES[s.dictationMode] || MODES.toggle;
  $('dark').checked = !!s.darkTheme;
  $('sounds').checked = !!s.sounds;
  $('paste').checked = !!s.autoPaste;
  document.body.classList.toggle('dark', !!s.darkTheme);

  $('hint').textContent = next.hotkeyOk === false
    ? 'Горячая клавиша занята другой программой — выберите другую.'
    : '';

  const h = next.history && next.history[0];
  $('last').textContent = h ? h.text : '—';
  $('last').title = h ? h.text : '';
}

function prettyKey(accel) {
  return String(accel)
    .replace(/ScrollLock/g, 'Scroll Lock')
    .replace(/Capslock/g, 'Caps Lock')
    .replace(/Numlock/g, 'Num Lock')
    .replace(/Control/g, 'Ctrl')
    .replace(/\+/g, ' + ');
}

async function boot() {
  render(await window.api.getState());
}

// ── действия ────────────────────────────────────────────────────────────────
$('hero').addEventListener('click', () => window.api.toggle());

$('row-hotkey').addEventListener('click', async () => {
  const i = PRESETS.indexOf(state.settings.hotkey);
  const next = PRESETS[(i + 1) % PRESETS.length];
  const res = await window.api.setSetting('hotkey', next);
  if (res && res.ok) render(await window.api.getState());
});

$('row-mode').addEventListener('click', async () => {
  const next = state.settings.dictationMode === 'toggle' ? 'hold' : 'toggle';
  const res = await window.api.setSetting('dictationMode', next);
  if (res && res.ok) render(await window.api.getState());
});

$('row-look').addEventListener('click', () => {
  $('extra').classList.toggle('open');
  $('look-chev').classList.toggle('open');
});

for (const [id, key] of [['dark', 'darkTheme'], ['sounds', 'sounds'], ['paste', 'autoPaste']]) {
  $(id).addEventListener('change', async (e) => {
    const res = await window.api.setSetting(key, e.target.checked);
    if (res && res.ok) render(await window.api.getState());
  });
}

window.api.onState((data) => render({ ...state, ...data }));
window.api.onHistory((history) => {
  const h = history && history[0];
  $('last').textContent = h ? h.text : '—';
});

boot();
