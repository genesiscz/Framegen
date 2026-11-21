// Framegen toolbar popup: read-only status for the active tab. The controls live in the player.
const $ = (id) => document.getElementById(id);

let tabId = null;

async function askStatus() {
  if (tabId == null) return null;
  try {
    return await chrome.tabs.sendMessage(tabId, { type: 'fcStatus' });
  } catch { return null; }
}

const pad = (n) => String(n).padStart(2, '0');
const clock = (ms) => { const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const stamp = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${clock(ms)}`; };

// Every file of the extension as the browser has it on disk, with its modification time.
function listFiles(dir, prefix = '') {
  return new Promise(resolve => {
    const reader = dir.createReader();
    const found = [];
    const next = () => reader.readEntries(entries => {
      if (!entries.length) { Promise.all(found).then(parts => resolve(parts.flat())); return; }
      for (const entry of entries) {
        found.push(entry.isDirectory
          ? listFiles(entry, prefix + entry.name + '/')
          : new Promise(done => entry.getMetadata(
            m => done([{ path: prefix + entry.name, at: m.modificationTime.getTime() }]), () => done([]))));
      }
      next();
    }, () => resolve([]));
    next();
  });
}

// The build is the newest file on disk: the last edit of an unpacked folder, the unpack time of an installed package.
// A tab runs the code it loaded with and the browser runs the manifest it loaded with, so either can be behind it.
const PAGE_CODE = /^(content\.js|src\/|engine\/|rt\/|assets\/)/;
const build = { at: 0, pageAt: 0, diskVersion: null };

async function readBuild() {
  const root = await new Promise(resolve => chrome.runtime.getPackageDirectoryEntry(resolve));
  const files = await listFiles(root);
  build.at = Math.max(0, ...files.map(f => f.at));
  build.pageAt = Math.max(0, ...files.filter(f => PAGE_CODE.test(f.path)).map(f => f.at));
  build.diskVersion = (await (await fetch(chrome.runtime.getURL('manifest.json'))).json()).version;
}

function renderBuild(s) {
  const el = $('build');
  if (!build.at) { el.textContent = ''; return; }
  let behind = '';
  if (build.diskVersion && build.diskVersion !== chrome.runtime.getManifest().version) {
    behind = `v${build.diskVersion} is on disk: reload the extension`;
  } else if (s && !(s.loadedAt >= build.pageAt)) {
    behind = s.loadedAt ? `this tab loaded ${clock(s.loadedAt)}: reload it` : 'this tab runs older code: reload it';
  }
  el.textContent = 'Build ' + stamp(build.at);
  if (behind) {
    const note = document.createElement('b');
    note.textContent = ' · ' + behind;
    el.appendChild(note);
  }
}

function render(s) {
  const dot = $('dot'), state = $('state'), stat = $('stat'), sys = $('sys');
  renderBuild(s);
  if (!s) {
    dot.classList.remove('on');
    state.textContent = 'Off';
    state.className = '';
    stat.textContent = '';
    sys.textContent = '';
    return;
  }
  $('ver').textContent = 'v' + s.version;
  dot.classList.toggle('on', s.running);
  state.textContent = s.running ? 'Running' : 'Off';
  state.className = s.running ? 'on' : '';
  stat.textContent = s.running
    ? `Output   ${s.fps} fps · ×${s.factor}\n`
      + `Rate     ${s.rateState}\n`
      + `Render   ${s.midMs} ms at ${s.res}p · ${s.drops} dropped\n`
      + `Engine   ${s.engine || '-'}`
    : (s.blocked || '');
  sys.textContent = `GPU: ${s.gpu || '-'}${s.f16 ? '' : ' · no half-float support'}`
    + (s.integrated ? '\nIntegrated GPU in use. Assign the browser to the discrete one: Windows Settings → Display → Graphics.' : '');
  sys.className = s.integrated ? 'warn' : '';
}

const showTab = (help) => {
  $('status').style.display = help ? 'none' : 'block';
  $('help').style.display = help ? 'block' : 'none';
  $('tabStatus').classList.toggle('act', !help);
  $('tabHelp').classList.toggle('act', help);
};
$('tabStatus').onclick = () => showTab(false);
$('tabHelp').onclick = () => showTab(true);
$('fullSettings').onclick = async () => {
  try {
    await chrome.runtime.openOptionsPage();
    window.close();
  } catch { /* leave the popup open if the browser rejects the request */ }
};

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab ? tab.id : null;
  $('ver').textContent = 'v' + chrome.runtime.getManifest().version;
  await readBuild().catch(() => {});
  const first = await askStatus();
  render(first);
  if (first && first.integrated) showTab(true);
  setInterval(async () => render(await askStatus()), 1000);
})();
