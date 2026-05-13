// ============================================================
// CONSTANTS
// ============================================================

const CATEGORIES = [
  { name: 'Streaming', emoji: '🎬' },
  { name: 'Music',     emoji: '🎵' },
  { name: 'News',      emoji: '📰' },
  { name: 'Fitness',   emoji: '💪' },
  { name: 'Tools',     emoji: '🛠️' },
  { name: 'Cloud',     emoji: '☁️' },
  { name: 'Gaming',    emoji: '🎮' },
  { name: 'Learning',  emoji: '📚' },
  { name: 'Health',    emoji: '💊' },
  { name: 'Other',     emoji: '📦' },
];

const EMOJI_PRESETS = [
  '🎬', '🎵', '▶️', '🍎', '📦', '🎮',
  '📚', '🛠️', '☁️', '💪', '📰', '💊',
  '🏃', '🎯', '💼', '🔐',
];

const STORAGE_KEY = 'st_data_v1';

// ============================================================
// FIREBASE — replace with your project config
// ============================================================

const FIREBASE_CONFIG = {
  apiKey:            'REPLACE_WITH_YOUR_API_KEY',
  authDomain:        'REPLACE_WITH_YOUR_AUTH_DOMAIN',
  projectId:         'REPLACE_WITH_YOUR_PROJECT_ID',
  storageBucket:     'REPLACE_WITH_YOUR_STORAGE_BUCKET',
  messagingSenderId: 'REPLACE_WITH_YOUR_SENDER_ID',
  appId:             'REPLACE_WITH_YOUR_APP_ID',
};

let db = null;
let subsCol = null;
let syncActive = false;

function initFirebase() {
  if (FIREBASE_CONFIG.apiKey.startsWith('REPLACE')) return false;
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.firestore();
    db.enablePersistence({ synchronizeTabs: true }).catch(function() {});
    subsCol = db.collection('subs');
    return true;
  } catch (e) {
    return false;
  }
}

// ============================================================
// STATE
// ============================================================

var subs = [];
var editingId = null;
var currentTab = 'dashboard';
var selectedCategory = null;
var selectedCycle = 'monthly';
var chartCategory = null;

// ============================================================
// HELPERS
// ============================================================

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmt(amount) {
  var n = Math.round(amount);
  if (n >= 1000) return '₹' + n.toLocaleString('en-IN');
  return '₹' + n;
}

function monthlyAmt(sub) {
  return sub.cycle === 'annual' ? sub.amount / 12 : sub.amount;
}

function annualAmt(sub) {
  return sub.cycle === 'annual' ? sub.amount : sub.amount * 12;
}

function daysUntil(dateStr) {
  var d = new Date(dateStr + 'T00:00:00');
  var now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((d - now) / 86400000);
}

function renewalLabel(dateStr) {
  var days = daysUntil(dateStr);
  if (days < 0)   return { text: 'Overdue',       cls: 'c-red' };
  if (days === 0) return { text: 'Today',          cls: 'c-red' };
  if (days === 1) return { text: 'Tomorrow',       cls: 'c-red' };
  if (days <= 7)  return { text: days + 'd',       cls: 'c-red' };
  if (days <= 30) return { text: days + 'd',       cls: 'c-orange' };
  var d = new Date(dateStr + 'T00:00:00');
  return {
    text: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
    cls: 'c-text-3',
  };
}

function cycleBadge(cycle) {
  return cycle === 'annual'
    ? '<span class="badge-annual">Annual</span>'
    : '<span class="badge-monthly">Monthly</span>';
}

function defaultRenewalDate(cycle) {
  var d = new Date();
  if (cycle === 'annual') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString().split('T')[0];
}

// ============================================================
// STORAGE
// ============================================================

function loadData() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) subs = JSON.parse(raw);
  } catch (e) {
    subs = [];
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(subs));
  if (subsCol) {
    subsCol.doc('data').set({ items: subs }).catch(function() {});
  }
}

// ============================================================
// FIREBASE SYNC
// ============================================================

function startSync() {
  if (!subsCol || syncActive) return;
  syncActive = true;
  subsCol.doc('data').onSnapshot(function(snap) {
    if (snap.exists) {
      var remote = snap.data().items || [];
      if (JSON.stringify(remote) !== JSON.stringify(subs)) {
        subs = remote;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(subs));
        renderCurrentTab();
      }
    }
  }, function() { syncActive = false; });
}

// ============================================================
// CRUD
// ============================================================

function addOrUpdateSub(data) {
  if (editingId) {
    var idx = subs.findIndex(function(s) { return s.id === editingId; });
    if (idx !== -1) subs[idx] = Object.assign({}, subs[idx], data);
  } else {
    subs.push(Object.assign({ id: uid(), active: true }, data));
  }
  saveData();
}

function deleteSub(id) {
  subs = subs.filter(function(s) { return s.id !== id; });
  saveData();
}

function toggleActive(id) {
  var s = subs.find(function(s) { return s.id === id; });
  if (s) { s.active = !s.active; saveData(); }
  renderCurrentTab();
}

// ============================================================
// FORM
// ============================================================

function submitSub() {
  var name     = document.getElementById('inp-name').value.trim();
  var emoji    = document.getElementById('inp-emoji').value.trim() || '💳';
  var amount   = parseFloat(document.getElementById('inp-amount').value);
  var renewsOn = document.getElementById('inp-renews').value;
  var notes    = document.getElementById('inp-notes').value.trim();

  if (!name || !amount || !renewsOn || !selectedCategory) {
    showToast('Fill in all required fields');
    return;
  }

  var wasEditing = !!editingId;
  addOrUpdateSub({
    name: name,
    emoji: emoji,
    amount: amount,
    cycle: selectedCycle,
    renewsOn: renewsOn,
    category: selectedCategory,
    notes: notes,
  });

  editingId = null;
  resetForm();
  switchTab('dashboard');
  showToast(wasEditing ? 'Updated!' : 'Subscription added!');
}

function editSub(id) {
  var s = subs.find(function(s) { return s.id === id; });
  if (!s) return;
  editingId = id;
  document.getElementById('inp-name').value    = s.name;
  document.getElementById('inp-emoji').value   = s.emoji || '💳';
  document.getElementById('inp-amount').value  = s.amount;
  document.getElementById('inp-renews').value  = s.renewsOn;
  document.getElementById('inp-notes').value   = s.notes || '';
  setCycle(s.cycle);
  setCategory(s.category);
  document.getElementById('add-screen-title').textContent = 'Edit Subscription';
  document.getElementById('btn-cancel-edit').classList.remove('hidden');
  document.getElementById('btn-submit').textContent = 'Save Changes';
  document.getElementById('btn-submit').disabled = false;
  switchTab('add');
}

function cancelEdit() {
  editingId = null;
  resetForm();
}

function resetForm() {
  editingId = null;
  document.getElementById('inp-name').value   = '';
  document.getElementById('inp-emoji').value  = '';
  document.getElementById('inp-amount').value = '';
  document.getElementById('inp-notes').value  = '';
  document.getElementById('inp-renews').value = defaultRenewalDate('monthly');
  setCycle('monthly');
  setCategory(null);
  document.getElementById('add-screen-title').textContent = 'Add Subscription';
  document.getElementById('btn-cancel-edit').classList.add('hidden');
  document.getElementById('btn-submit').textContent = 'Add Subscription';
  document.getElementById('btn-submit').disabled = true;
  // reset emoji preset highlight
  document.querySelectorAll('.emoji-btn').forEach(function(btn) {
    btn.classList.remove('chip-active');
  });
}

function setCycle(cycle) {
  selectedCycle = cycle;
  document.getElementById('btn-cycle-monthly').classList.toggle('cycle-active', cycle === 'monthly');
  document.getElementById('btn-cycle-annual').classList.toggle('cycle-active', cycle === 'annual');
  if (!editingId) {
    document.getElementById('inp-renews').value = defaultRenewalDate(cycle);
  }
}

function setCategory(cat) {
  selectedCategory = cat;
  document.querySelectorAll('.cat-btn').forEach(function(btn) {
    btn.classList.toggle('chip-active', btn.dataset.cat === cat);
  });
  validateForm();
}

function syncEmojiPreset(val) {
  document.querySelectorAll('.emoji-btn').forEach(function(btn) {
    btn.classList.toggle('chip-active', btn.dataset.emoji === val);
  });
}

function setEmoji(emoji) {
  document.getElementById('inp-emoji').value = emoji;
  syncEmojiPreset(emoji);
}

function validateForm() {
  var name   = document.getElementById('inp-name').value.trim();
  var amount = document.getElementById('inp-amount').value;
  var btn    = document.getElementById('btn-submit');
  btn.disabled = !name || !amount || !selectedCategory;
}

// ============================================================
// RENDERING
// ============================================================

function renderCurrentTab() {
  if (currentTab === 'dashboard') renderDashboard();
  else if (currentTab === 'subs') renderSubs();
  else if (currentTab === 'insights') renderInsights();
}

function renderDashboard() {
  var active   = subs.filter(function(s) { return s.active; });
  var monthly  = active.reduce(function(sum, s) { return sum + monthlyAmt(s); }, 0);
  var annual   = active.reduce(function(sum, s) { return sum + annualAmt(s); }, 0);
  var inactive = subs.filter(function(s) { return !s.active; }).length;

  document.getElementById('hero-monthly').textContent   = fmt(monthly);
  document.getElementById('hero-annual-sub').textContent = fmt(annual) + '/yr · ' + active.length + ' active';
  document.getElementById('stat-monthly').textContent   = fmt(monthly);
  document.getElementById('stat-annual').textContent    = fmt(annual);
  document.getElementById('stat-active').textContent    = active.length;
  document.getElementById('stat-inactive').textContent  = inactive;

  // Upcoming renewals (within 30 days)
  var upcoming = subs
    .filter(function(s) {
      var d = daysUntil(s.renewsOn);
      return s.active && d >= 0 && d <= 30;
    })
    .sort(function(a, b) { return daysUntil(a.renewsOn) - daysUntil(b.renewsOn); });

  var upcomingSection = document.getElementById('upcoming-section');
  var upcomingList    = document.getElementById('upcoming-list');

  if (upcoming.length === 0) {
    upcomingSection.classList.add('hidden');
  } else {
    upcomingSection.classList.remove('hidden');
    upcomingList.innerHTML = upcoming.map(function(s) {
      var rl = renewalLabel(s.renewsOn);
      return renderSubCard(s, true);
    }).join('');
  }

  // Full list
  var recentEl = document.getElementById('recent-list');
  if (subs.length === 0) {
    recentEl.innerHTML = '<div class="py-12 text-center"><div class="text-5xl mb-3">💳</div><div class="c-text-3 text-sm font-medium">No subscriptions yet</div><div class="c-text-3 text-xs mt-1">Tap + to add your first one</div></div>';
  } else {
    recentEl.innerHTML = subs.map(function(s) { return renderSubCard(s, false); }).join('');
    initSwipeListeners();
  }
}

function renderSubs() {
  var el = document.getElementById('subs-list');

  if (subs.length === 0) {
    el.innerHTML = '<div class="py-16 text-center"><div class="text-5xl mb-4">💳</div><div class="c-text-2 font-semibold mb-1">No subscriptions</div><div class="c-text-3 text-sm">Tap + to add your first one</div></div>';
    return;
  }

  // Group by category
  var grouped = {};
  subs.forEach(function(s) {
    if (!grouped[s.category]) grouped[s.category] = [];
    grouped[s.category].push(s);
  });

  var html = '';
  Object.keys(grouped).forEach(function(cat) {
    var items     = grouped[cat];
    var catDef    = CATEGORIES.find(function(c) { return c.name === cat; }) || { emoji: '📦' };
    var catMonthly = items
      .filter(function(s) { return s.active; })
      .reduce(function(sum, s) { return sum + monthlyAmt(s); }, 0);

    html += '<div class="mb-5">'
      + '<div class="flex items-center justify-between px-1 mb-2">'
      + '<div class="flex items-center gap-2"><span>' + catDef.emoji + '</span>'
      + '<span class="label-sm">' + escapeHtml(cat) + '</span></div>'
      + (catMonthly > 0
        ? '<span class="text-xs font-semibold c-text-3">' + fmt(catMonthly) + '/mo</span>'
        : '')
      + '</div>'
      + '<div class="space-y-2">'
      + items.map(function(s) { return renderSubCard(s, false); }).join('')
      + '</div></div>';
  });

  el.innerHTML = html;
  initSwipeListeners();
}

function renderSubCard(s, compact) {
  var rl      = renewalLabel(s.renewsOn);
  var opacity = s.active ? '' : 'opacity-50';
  return '<div class="sub-card ' + opacity + '" data-id="' + s.id + '">'
    + '<div class="sub-card-inner flex items-center gap-3 px-4 py-3">'
    + '<div class="sub-emoji">' + escapeHtml(s.emoji || '💳') + '</div>'
    + '<div class="flex-1 min-w-0 cursor-pointer" onclick="editSub(\'' + s.id + '\')">'
    + '<div class="flex items-center gap-2 flex-wrap">'
    + '<span class="c-text-1 font-semibold text-sm">' + escapeHtml(s.name) + '</span>'
    + cycleBadge(s.cycle)
    + '</div>'
    + '<div class="flex items-center gap-2 mt-0.5">'
    + '<span class="text-xs font-bold c-violet">' + fmt(s.amount) + '</span>'
    + '<span class="text-xs c-text-3">·</span>'
    + '<span class="text-xs font-semibold ' + rl.cls + '">' + rl.text + '</span>'
    + '</div>'
    + '</div>'
    + '<button class="toggle-btn ' + (s.active ? 'toggle-on' : 'toggle-off') + '"'
    + ' onclick="event.stopPropagation();toggleActive(\'' + s.id + '\')"'
    + ' title="' + (s.active ? 'Pause' : 'Resume') + '">'
    + (s.active ? '●' : '○')
    + '</button>'
    + '</div>'
    + '<div class="swipe-delete-action" data-id="' + s.id + '">'
    + '<span class="text-xs font-bold text-white">Delete</span>'
    + '</div>'
    + '</div>';
}

function renderInsights() {
  var contentEl = document.getElementById('insights-content');
  var active    = subs.filter(function(s) { return s.active; });

  if (active.length === 0) {
    contentEl.innerHTML = '<div class="py-16 text-center"><div class="text-5xl mb-4">📊</div><div class="c-text-2 font-semibold mb-1">No data yet</div><div class="c-text-3 text-sm">Add subscriptions to see insights</div></div>';
    return;
  }

  var monthly = active.reduce(function(sum, s) { return sum + monthlyAmt(s); }, 0);
  var annual  = active.reduce(function(sum, s) { return sum + annualAmt(s); }, 0);
  var perDay  = monthly / 30;

  // Top 5 by monthly cost
  var top5   = active.slice().sort(function(a, b) { return monthlyAmt(b) - monthlyAmt(a); }).slice(0, 5);
  var maxAmt = monthlyAmt(top5[0]);

  // Category totals
  var catTotals = {};
  active.forEach(function(s) {
    catTotals[s.category] = (catTotals[s.category] || 0) + monthlyAmt(s);
  });
  var catEntries = Object.entries(catTotals).sort(function(a, b) { return b[1] - a[1]; });

  var topBars = top5.map(function(s) {
    var pct = Math.round((monthlyAmt(s) / maxAmt) * 100);
    return '<div>'
      + '<div class="flex justify-between items-center mb-1">'
      + '<div class="flex items-center gap-2">'
      + '<span>' + escapeHtml(s.emoji || '💳') + '</span>'
      + '<span class="text-sm c-text-1 font-medium">' + escapeHtml(s.name) + '</span>'
      + '</div>'
      + '<span class="text-sm font-bold c-violet">' + fmt(monthlyAmt(s)) + '<span class="text-xs font-normal c-text-3">/mo</span></span>'
      + '</div>'
      + '<div class="h-1.5 rounded-full" style="background:var(--surface-2)">'
      + '<div class="h-1.5 rounded-full transition-all" style="width:' + pct + '%;background:linear-gradient(90deg,#7c3aed,#a855f7)"></div>'
      + '</div></div>';
  }).join('');

  var catRows = catEntries.map(function(entry) {
    var cat    = entry[0];
    var amt    = entry[1];
    var catDef = CATEGORIES.find(function(c) { return c.name === cat; }) || { emoji: '📦' };
    var pct    = Math.round((amt / monthly) * 100);
    return '<div class="flex items-center gap-3">'
      + '<span class="text-lg">' + catDef.emoji + '</span>'
      + '<div class="flex-1">'
      + '<div class="flex justify-between items-center">'
      + '<span class="text-xs c-text-2 font-medium">' + escapeHtml(cat) + '</span>'
      + '<span class="text-xs font-bold c-text-1">' + fmt(amt) + '<span class="c-text-3 font-normal">/mo</span></span>'
      + '</div>'
      + '<div class="h-1 rounded-full mt-1" style="background:var(--surface-2)">'
      + '<div class="h-1 rounded-full" style="width:' + pct + '%;background:var(--c-violet)"></div>'
      + '</div></div>'
      + '<span class="text-xs c-text-3 w-8 text-right">' + pct + '%</span>'
      + '</div>';
  }).join('');

  contentEl.innerHTML = ''
    + '<div class="glass-card p-4 mb-4"><div class="label-sm mb-4">Spending by Category</div>'
    + '<div style="height:220px"><canvas id="chart-cat"></canvas></div></div>'

    + '<div class="grid grid-cols-3 gap-3 mb-4">'
    + '<div class="glass-card p-3 text-center"><div class="label-sm mb-1">Monthly</div><div class="text-sm font-bold c-violet mt-1">' + fmt(monthly) + '</div></div>'
    + '<div class="glass-card p-3 text-center"><div class="label-sm mb-1">Annual</div><div class="text-sm font-bold c-violet mt-1">' + fmt(annual) + '</div></div>'
    + '<div class="glass-card p-3 text-center"><div class="label-sm mb-1">Per Day</div><div class="text-sm font-bold c-text-2 mt-1">' + fmt(perDay) + '</div></div>'
    + '</div>'

    + '<div class="glass-card p-4 mb-4"><div class="label-sm mb-4">Top by Cost</div><div class="space-y-4">' + topBars + '</div></div>'

    + '<div class="glass-card p-4 mb-4"><div class="label-sm mb-4">Category Breakdown</div><div class="space-y-3">' + catRows + '</div></div>';

  renderCategoryChart(catEntries, monthly);
}

var CHART_COLORS = [
  '#7c3aed', '#a855f7', '#ec4899', '#3b82f6',
  '#10b981', '#f59e0b', '#ef4444', '#14b8a6',
  '#8b5cf6', '#64748b',
];

function renderCategoryChart(catEntries, total) {
  if (chartCategory) chartCategory.destroy();
  var ctx = document.getElementById('chart-cat');
  if (!ctx) return;
  var dark = getCurrentTheme() === 'dark';
  chartCategory = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: catEntries.map(function(e) { return e[0]; }),
      datasets: [{
        data: catEntries.map(function(e) { return Math.round(e[1]); }),
        backgroundColor: CHART_COLORS.slice(0, catEntries.length),
        borderColor: dark ? '#07071a' : '#f8fafc',
        borderWidth: 2,
        hoverOffset: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: dark ? 'rgba(226,232,240,0.5)' : '#64748b',
            font: { size: 11 },
            padding: 12,
            usePointStyle: true,
          },
        },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              return ' ' + fmt(ctx.raw) + '/mo (' + Math.round(ctx.raw / total * 100) + '%)';
            },
          },
        },
      },
    },
  });
}

// ============================================================
// SWIPE TO DELETE
// ============================================================

function initSwipeListeners() {
  document.querySelectorAll('.sub-card').forEach(function(card) {
    if (card._swipeInit) return;
    card._swipeInit = true;

    var inner        = card.querySelector('.sub-card-inner');
    var deleteAction = card.querySelector('.swipe-delete-action');
    if (!inner || !deleteAction) return;

    var startX = 0, currentX = 0, isDragging = false;

    function onStart(x) { startX = x; currentX = x; isDragging = true; }
    function onMove(x) {
      if (!isDragging) return;
      currentX = x;
      var diff = Math.min(0, currentX - startX);
      if (diff < -5) {
        inner.style.transform       = 'translateX(' + Math.max(-80, diff) + 'px)';
        deleteAction.style.opacity  = Math.min(1, Math.abs(diff) / 60);
      }
    }
    function onEnd() {
      if (!isDragging) return;
      isDragging = false;
      if (currentX - startX < -60) {
        pendingDeleteId = card.dataset.id;
        var s = subs.find(function(s) { return s.id === pendingDeleteId; });
        document.getElementById('modal-sub-name').textContent = s ? s.name : '';
        openModal();
      }
      inner.style.transform      = '';
      deleteAction.style.opacity = 0;
    }

    card.addEventListener('touchstart', function(e) { onStart(e.touches[0].clientX); }, { passive: true });
    card.addEventListener('touchmove',  function(e) { onMove(e.touches[0].clientX); },  { passive: true });
    card.addEventListener('touchend',   onEnd);
    card.addEventListener('mousedown',  function(e) { onStart(e.clientX); });
    card.addEventListener('mousemove',  function(e) { if (isDragging) onMove(e.clientX); });
    card.addEventListener('mouseup',    onEnd);
    card.addEventListener('mouseleave', onEnd);
  });
}

// ============================================================
// MODAL
// ============================================================

var pendingDeleteId = null;

function openModal() {
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  pendingDeleteId = null;
  document.getElementById('modal-overlay').classList.add('hidden');
}

function confirmDelete() {
  if (pendingDeleteId) deleteSub(pendingDeleteId);
  pendingDeleteId = null;
  closeModal();
  renderCurrentTab();
  showToast('Deleted');
}

// ============================================================
// NAVIGATION
// ============================================================

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.screen').forEach(function(el) { el.classList.add('hidden'); });
  document.querySelectorAll('.nav-btn').forEach(function(btn) { btn.classList.remove('nav-active'); });

  var map = { add: 'screen-add', dashboard: 'screen-dashboard', subs: 'screen-subs', insights: 'screen-insights' };
  document.getElementById(map[tab]).classList.remove('hidden');
  var navBtn = document.querySelector('.nav-btn[data-tab="' + tab + '"]');
  if (navBtn) navBtn.classList.add('nav-active');

  renderCurrentTab();
}

// ============================================================
// CHIP RENDERERS
// ============================================================

function renderCategoryChips() {
  var el = document.getElementById('category-chips');
  el.innerHTML = CATEGORIES.map(function(c) {
    return '<button class="cat-btn chip-btn py-2 px-2 rounded-xl text-xs font-semibold text-center transition-all"'
      + ' data-cat="' + escapeHtml(c.name) + '"'
      + ' onclick="setCategory(\'' + escapeHtml(c.name) + '\')">'
      + c.emoji + ' ' + escapeHtml(c.name)
      + '</button>';
  }).join('');
}

function renderEmojiPresets() {
  var el = document.getElementById('emoji-presets');
  el.innerHTML = EMOJI_PRESETS.map(function(e) {
    return '<button class="emoji-btn chip-btn w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-all"'
      + ' data-emoji="' + e + '"'
      + ' onclick="setEmoji(\'' + e + '\')">'
      + e
      + '</button>';
  }).join('');
}

// ============================================================
// TOAST
// ============================================================

var toastTimer;

function showToast(msg) {
  var el       = document.getElementById('toast');
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { el.style.opacity = '0'; }, 2200);
}

// ============================================================
// THEME
// ============================================================

function getCurrentTheme() {
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('st_theme', t);
  document.querySelectorAll('.theme-icon').forEach(function(el) {
    el.textContent = t === 'dark' ? '☀️' : '🌙';
  });
  if (currentTab === 'insights') renderInsights();
}

function toggleTheme() {
  applyTheme(getCurrentTheme() === 'dark' ? 'light' : 'dark');
}

// ============================================================
// INIT
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
  applyTheme(localStorage.getItem('st_theme') || 'dark');

  loadData();
  renderCategoryChips();
  renderEmojiPresets();
  setCycle('monthly');
  document.getElementById('inp-renews').value = defaultRenewalDate('monthly');

  document.getElementById('modal-overlay').addEventListener('click', function(e) {
    if (e.target === this) closeModal();
  });

  document.getElementById('inp-name').addEventListener('input', validateForm);
  document.getElementById('inp-amount').addEventListener('input', validateForm);

  var fbOk = initFirebase();
  if (fbOk) {
    subsCol.doc('data').get().then(function(snap) {
      if (snap.exists) {
        subs = snap.data().items || [];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(subs));
      }
      switchTab(subs.length ? 'dashboard' : 'add');
      startSync();
    }).catch(function() {
      switchTab(subs.length ? 'dashboard' : 'add');
    });
  } else {
    switchTab(subs.length ? 'dashboard' : 'add');
  }
});
