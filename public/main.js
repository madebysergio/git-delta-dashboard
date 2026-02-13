const POLL_MS = 3500;

const app = document.getElementById('app');
if (!app) {
  throw new Error('Missing #app mount node');
}
let state = null;
let expanded = null;

const CLASSES = {
  page: 'mx-auto flex h-full w-full max-w-6xl items-center justify-center p-4 sm:p-6',
  frame: 'grid h-[min(92vh,760px)] w-full grid-rows-[auto_auto_1fr] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900',
  bar: 'flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:px-5',
  title: 'truncate text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100 sm:text-base',
  branch: 'truncate text-xs font-medium text-slate-500 dark:text-slate-400 sm:text-sm',
  topRight: 'flex items-center gap-2',
  themeBtn: 'rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 sm:text-sm',
  counters: 'flex gap-2 overflow-x-auto border-b border-slate-200 p-3 dark:border-slate-800 sm:p-4',
  counter: 'group flex min-w-[146px] cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-left transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600 dark:hover:bg-slate-700/70 sm:min-w-[160px]',
  counterActive: 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900',
  counterLabel: 'text-xs font-medium text-slate-500 group-[.is-active]:text-slate-200 dark:text-slate-400 dark:group-[.is-active]:text-slate-700',
  counterValue: 'text-2xl font-semibold leading-none tracking-tight',
  empty: 'flex h-full items-center justify-center px-4 text-center text-sm text-slate-500 dark:text-slate-400',
  panel: 'm-0 list-none overflow-auto p-0',
  row: 'flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800 sm:px-5',
  file: 'truncate text-sm text-slate-800 dark:text-slate-200',
  delta: 'whitespace-nowrap text-xs text-slate-500 dark:text-slate-400 sm:text-sm',
  err: 'm-0 p-4 text-sm text-red-600 dark:text-red-400 sm:p-5'
};

function stat(value) {
  return value == null ? '-' : String(value);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function getInitialTheme() {
  try {
    const stored = localStorage.getItem('git-dashboard-theme');
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {}
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  try {
    localStorage.setItem('git-dashboard-theme', theme);
  } catch {}
}

function toggleTheme() {
  const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
  applyTheme(next);
  render();
}

function rowFile(item) {
  const li = el('li', CLASSES.row);
  li.append(el('span', CLASSES.file, item.file));
  li.append(el('span', CLASSES.delta, `+${stat(item.additions)} -${stat(item.deletions)}`));
  return li;
}

function rowCommit(item) {
  const li = el('li', CLASSES.row);
  const stamp = item.ts ? new Date(item.ts * 1000).toLocaleString() : '-';
  li.append(el('span', CLASSES.file, item.message || item.oid.slice(0, 7)));
  li.append(el('span', CLASSES.delta, `+${stat(item.additions)} -${stat(item.deletions)} ${stamp}`));
  return li;
}

function getGroups() {
  if (!state) return [];
  const c = state.counts;
  return [
    { id: 'staged', label: '+staged', value: c.staged },
    { id: 'modified', label: '~modified', value: c.modified },
    { id: 'untracked', label: '?untracked', value: c.untracked },
    { id: 'ahead', label: '↑ahead', value: c.ahead },
    { id: 'behind', label: '↓behind', value: c.behind }
  ].filter((g) => g.value > 0);
}

function appendFrameRoot() {
  const page = el('section', CLASSES.page);
  const frame = el('section', CLASSES.frame);
  page.append(frame);
  app.append(page);
  return frame;
}

function renderLoading(label) {
  app.innerHTML = '';
  const frame = appendFrameRoot();
  frame.append(el('div', CLASSES.bar, label));
}

function render() {
  app.innerHTML = '';

  if (!state) {
    renderLoading('loading');
    return;
  }

  const groups = getGroups();
  if (expanded && !groups.some((g) => g.id === expanded)) expanded = null;

  const frame = appendFrameRoot();
  const header = el('header', CLASSES.bar);
  const left = el('div', 'min-w-0');
  left.append(el('div', CLASSES.title, state.repository));
  left.append(el('div', CLASSES.branch, state.branch));
  header.append(left);

  const right = el('div', CLASSES.topRight);
  const themeIsDark = document.documentElement.classList.contains('dark');
  const toggle = el('button', CLASSES.themeBtn, themeIsDark ? 'light' : 'dark');
  toggle.type = 'button';
  toggle.addEventListener('click', toggleTheme);
  right.append(toggle);
  header.append(right);
  frame.append(header);

  const counters = el('section', CLASSES.counters);
  for (const g of groups) {
    const active = expanded === g.id;
    const btn = el('button', `${CLASSES.counter}${active ? ` ${CLASSES.counterActive} is-active` : ''}`.trim());
    btn.type = 'button';
    btn.append(el('span', CLASSES.counterLabel, g.label));
    btn.append(el('span', CLASSES.counterValue, String(g.value)));
    btn.addEventListener('click', () => {
      expanded = active ? null : g.id;
      render();
    });
    counters.append(btn);
  }
  frame.append(counters);

  if (!expanded) {
    frame.append(el('div', CLASSES.empty, groups.length ? 'select a delta to inspect' : 'working tree clean'));
    return;
  }

  const panel = el('ul', CLASSES.panel);
  if (expanded === 'staged') state.details.staged.forEach((i) => panel.append(rowFile(i)));
  if (expanded === 'modified') state.details.modified.forEach((i) => panel.append(rowFile(i)));
  if (expanded === 'untracked') {
    state.details.untracked.forEach((i) => {
      const r = el('li', CLASSES.row);
      r.append(el('span', CLASSES.file, i.file));
      panel.append(r);
    });
  }
  if (expanded === 'ahead') state.details.ahead.forEach((i) => panel.append(rowCommit(i)));
  if (expanded === 'behind') state.details.behind.forEach((i) => panel.append(rowCommit(i)));
  frame.append(panel);
}

async function fetchState() {
  try {
    const res = await fetch('/api/state');
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'failed');
    state = body;
    render();
  } catch (err) {
    app.innerHTML = '';
    const frame = appendFrameRoot();
    frame.append(el('div', CLASSES.bar, 'error'));
    frame.append(el('pre', CLASSES.err, err?.message || 'failed to load state'));
  }
}

applyTheme(getInitialTheme());
renderLoading('loading');
fetchState();
setInterval(fetchState, POLL_MS);
