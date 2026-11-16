// Проба: какие имена клавиши Scroll Lock принимает Electron.
const { app, globalShortcut } = require('electron');

const names = ['ScrollLock', 'Scrolllock', 'Scroll Lock', 'Scroll_Lock', 'Capslock', 'Numlock', 'F9'];

app.whenReady().then(() => {
  const results = [];
  for (const name of names) {
    let ok;
    try { ok = globalShortcut.register(name, () => {}); }
    catch (e) { ok = 'исключение: ' + e.message; }
    results.push({ name, ok });
    console.log(JSON.stringify({ name, ok }));
  }
  const good = results.filter((r) => r.ok === true).map((r) => r.name);
  console.log('ПОДОШЛИ:', JSON.stringify(good));
  setTimeout(() => { globalShortcut.unregisterAll(); app.quit(); }, 300);
});
