'use strict';

// ---------- Məlumat saxlama ----------
// Bütün pul məbləğləri qəpiklə (tam ədəd) saxlanılır ki, yuvarlaqlaşdırma xətası olmasın.
const STORE_KEY = 'cayevi-pos-v1';

const DEFAULT_MENU = [
  ['Qara çay (stəkan)', 'Çay', 100],
  ['Qara çay (çaynik)', 'Çay', 500],
  ['Limonlu çay (çaynik)', 'Çay', 600],
  ['Kəklikotu çayı (çaynik)', 'Çay', 600],
  ['Yaşıl çay (çaynik)', 'Çay', 600],
  ['Meyvə çayı (çaynik)', 'Çay', 700],
  ['Türk qəhvəsi', 'Qəhvə', 400],
  ['Amerikano', 'Qəhvə', 400],
  ['Kapuçino', 'Qəhvə', 500],
  ['Latte', 'Qəhvə', 550],
  ['Su (0.5 l)', 'Soyuq içkilər', 100],
  ['Qazlı içki', 'Soyuq içkilər', 200],
  ['Təbii şirə', 'Soyuq içkilər', 400],
  ['Ayran', 'Soyuq içkilər', 200],
  ['Mürəbbə dəsti', 'Şirniyyat', 400],
  ['Paxlava (porsiya)', 'Şirniyyat', 500],
  ['Şəkərbura', 'Şirniyyat', 300],
  ['Tort (dilim)', 'Şirniyyat', 450],
  ['Limon (dilim)', 'Əlavələr', 50],
  ['Nabat', 'Əlavələr', 100],
  ['Səhər yeməyi dəsti', 'Yeməklər', 1200],
  ['Qutab (ədəd)', 'Yeməklər', 150],
  ['Kabab (porsiya)', 'Yeməklər', 1000],
  ['Dolma (porsiya)', 'Yeməklər', 800],
  ['Nard (saatlıq)', 'Oyunlar', 200],
];

function defaultState() {
  return {
    settings: {
      name: 'Çay Evi',
      address: '',
      tables: 12,
      service: 0,
      footer: 'Bizi seçdiyiniz üçün təşəkkür edirik!',
    },
    menu: DEFAULT_MENU.map(([name, cat, price], i) => ({ id: 'm' + (i + 1), name, cat, price, active: true })),
    orders: {},   // masaId -> { lines: [{itemId, name, price, qty}], discount, note, openedAt }
    sales: [],    // bağlanmış çeklər
    nextReceipt: 1,
  };
}

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return Object.assign(defaultState(), JSON.parse(raw));
  } catch (e) { console.error(e); }
  return defaultState();
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) {
    toast('Yadda saxlamaq alınmadı: ' + e.message);
  }
}

// ---------- Köməkçilər ----------
const $ = (sel) => document.querySelector(sel);
const money = (q) => (q / 100).toFixed(2) + ' ₼';
const toQ = (v) => Math.round(parseFloat(String(v).replace(',', '.')) * 100) || 0;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtDateTime = (iso) => {
  const d = new Date(iso);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}

function tableIds() {
  const ids = ['paket'];
  for (let i = 1; i <= state.settings.tables; i++) ids.push('t' + i);
  return ids;
}
const tableName = (id) => (id === 'paket' ? 'Paket (aparmaq)' : 'Masa ' + id.slice(1));

// Sifarişin cəmləri
function calc(order) {
  const subtotal = order.lines.reduce((s, l) => s + l.price * l.qty, 0);
  const discount = Math.round(subtotal * (order.discount || 0) / 100);
  const afterDisc = subtotal - discount;
  const serviceRate = order.tableId === 'paket' ? 0 : state.settings.service;
  const service = Math.round(afterDisc * serviceRate / 100);
  return { subtotal, discount, service, serviceRate, total: afterDisc + service };
}

// ---------- Naviqasiya ----------
let currentTable = null;
let currentCat = null;

function showView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
  document.querySelectorAll('.tab').forEach((t) =>
    t.classList.toggle('active', t.dataset.view === name || (name === 'order' && t.dataset.view === 'tables')));
  if (name === 'tables') renderTables();
  if (name === 'menu') renderMenuAdmin();
  if (name === 'reports') runReport();
  if (name === 'settings') fillSettings();
}

document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));

// ---------- Masalar ----------
function renderTables() {
  const grid = $('#tablesGrid');
  grid.innerHTML = tableIds().map((id) => {
    const o = state.orders[id];
    const busy = o && o.lines.length;
    const cls = id === 'paket' ? 'takeaway' : busy ? 'busy' : '';
    const count = busy ? o.lines.reduce((s, l) => s + l.qty, 0) : 0;
    return `<button class="table-card ${cls}" data-id="${id}">
      <span class="t-name">${esc(tableName(id))}</span>
      <span class="t-info">${busy ? `${count} məhsul · ${fmtDateTime(o.openedAt).slice(11)}` : 'Boş'}</span>
      <span class="t-sum">${busy ? money(calc(o).total) : ''}</span>
    </button>`;
  }).join('');
  grid.querySelectorAll('.table-card').forEach((b) => b.addEventListener('click', () => openTable(b.dataset.id)));
}

// ---------- Sifariş ekranı ----------
function getOrder(id) {
  if (!state.orders[id]) {
    state.orders[id] = { tableId: id, lines: [], discount: 0, note: '', openedAt: new Date().toISOString() };
  }
  return state.orders[id];
}

function openTable(id) {
  currentTable = id;
  $('#itemSearch').value = '';
  showView('order');
  renderCats();
  renderItems();
  renderTicket();
}

function activeMenu() { return state.menu.filter((m) => m.active); }
function categories() { return [...new Set(activeMenu().map((m) => m.cat))]; }

function renderCats() {
  const cats = categories();
  if (!cats.includes(currentCat)) currentCat = cats[0] || null;
  $('#catBar').innerHTML = cats.map((c) =>
    `<button class="cat ${c === currentCat ? 'active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
  $('#catBar').querySelectorAll('.cat').forEach((b) => b.addEventListener('click', () => {
    currentCat = b.dataset.cat;
    $('#itemSearch').value = '';
    renderCats();
    renderItems();
  }));
}

function renderItems() {
  const q = $('#itemSearch').value.trim().toLocaleLowerCase('az');
  const items = activeMenu().filter((m) => (q ? m.name.toLocaleLowerCase('az').includes(q) : m.cat === currentCat));
  $('#itemsGrid').innerHTML = items.length
    ? items.map((m) => `<button class="item-btn" data-id="${m.id}">
        <span class="i-name">${esc(m.name)}</span><span class="i-price">${money(m.price)}</span></button>`).join('')
    : '<div class="empty">Məhsul tapılmadı</div>';
  $('#itemsGrid').querySelectorAll('.item-btn').forEach((b) => b.addEventListener('click', () => addItem(b.dataset.id)));
}

$('#itemSearch').addEventListener('input', renderItems);

function addItem(itemId) {
  const item = state.menu.find((m) => m.id === itemId);
  if (!item) return;
  const order = getOrder(currentTable);
  const line = order.lines.find((l) => l.itemId === itemId && l.price === item.price);
  if (line) line.qty++;
  else order.lines.push({ itemId, name: item.name, price: item.price, qty: 1 });
  save();
  renderTicket();
}

function changeQty(idx, delta) {
  const order = getOrder(currentTable);
  const line = order.lines[idx];
  if (!line) return;
  line.qty += delta;
  if (line.qty <= 0) order.lines.splice(idx, 1);
  save();
  renderTicket();
}

function renderTicket() {
  const order = getOrder(currentTable);
  $('#ticketTitle').textContent = tableName(currentTable);
  if (document.activeElement !== $('#discountInput')) $('#discountInput').value = order.discount || 0;
  if (document.activeElement !== $('#noteInput')) $('#noteInput').value = order.note || '';

  const box = $('#ticketLines');
  box.innerHTML = order.lines.length
    ? order.lines.map((l, i) => `<div class="line">
        <div><div class="l-name">${esc(l.name)}</div><div class="l-unit">${money(l.price)}</div></div>
        <div class="qty"><button data-i="${i}" data-d="-1">−</button><span>${l.qty}</span><button data-i="${i}" data-d="1">+</button></div>
        <div class="l-sum">${money(l.price * l.qty)}</div></div>`).join('')
    : '<div class="empty">Sifariş boşdur.<br>Soldan məhsul seçin.</div>';
  box.querySelectorAll('.qty button').forEach((b) =>
    b.addEventListener('click', () => changeQty(+b.dataset.i, +b.dataset.d)));

  const t = calc(order);
  $('#ticketTotals').innerHTML = `
    <div><span>Cəm</span><span>${money(t.subtotal)}</span></div>
    ${t.discount ? `<div><span>Endirim (${order.discount}%)</span><span>−${money(t.discount)}</span></div>` : ''}
    ${t.service ? `<div><span>Xidmət (${t.serviceRate}%)</span><span>${money(t.service)}</span></div>` : ''}
    <div class="grand"><span>Yekun</span><span>${money(t.total)}</span></div>`;

  const empty = !order.lines.length;
  $('#payBtn').disabled = empty;
  $('#printBill').disabled = empty;
}

$('#discountInput').addEventListener('input', (e) => {
  const v = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
  getOrder(currentTable).discount = v;
  save();
  renderTicket();
});
$('#noteInput').addEventListener('change', (e) => {
  getOrder(currentTable).note = e.target.value.trim();
  save();
});

$('#backToTables').addEventListener('click', () => {
  // Boş sifarişi saxlamırıq
  const o = state.orders[currentTable];
  if (o && !o.lines.length) { delete state.orders[currentTable]; save(); }
  showView('tables');
});

$('#cancelOrder').addEventListener('click', () => {
  const o = state.orders[currentTable];
  if (o && o.lines.length && !confirm(tableName(currentTable) + ' üzrə sifariş ləğv edilsin?')) return;
  delete state.orders[currentTable];
  save();
  toast('Sifariş ləğv edildi');
  showView('tables');
});

$('#printBill').addEventListener('click', () => {
  const order = getOrder(currentTable);
  printReceipt(buildReceiptData(order, null), true);
});

// ---------- Ödəniş ----------
const payDialog = $('#payDialog');

$('#payBtn').addEventListener('click', () => {
  const order = getOrder(currentTable);
  if (!order.lines.length) return;
  $('#payTotal').textContent = money(calc(order).total);
  $('#cashGiven').value = '';
  $('#changeOut').textContent = '';
  payDialog.querySelector('input[value="Nağd"]').checked = true;
  $('#cashRow').style.display = '';
  payDialog.showModal();
  $('#cashGiven').focus();
});

payDialog.querySelectorAll('input[name=method]').forEach((r) => r.addEventListener('change', () => {
  const cash = payDialog.querySelector('input[name=method]:checked').value === 'Nağd';
  $('#cashRow').style.display = cash ? '' : 'none';
  $('#changeOut').textContent = '';
}));

$('#cashGiven').addEventListener('input', () => {
  const total = calc(getOrder(currentTable)).total;
  const given = toQ($('#cashGiven').value);
  const out = $('#changeOut');
  if (!$('#cashGiven').value) { out.textContent = ''; return; }
  out.textContent = given >= total ? 'Qaytarılacaq: ' + money(given - total) : 'Çatışmır: ' + money(total - given);
  out.style.color = given >= total ? 'var(--free)' : 'var(--danger)';
});

$('#confirmPay').addEventListener('click', (e) => {
  const order = getOrder(currentTable);
  const t = calc(order);
  const method = payDialog.querySelector('input[name=method]:checked').value;
  const given = method === 'Nağd' && $('#cashGiven').value ? toQ($('#cashGiven').value) : t.total;
  if (given < t.total) {
    e.preventDefault();
    toast('Alınan məbləğ yekundan azdır');
    return;
  }
  const sale = {
    id: uid(),
    no: state.nextReceipt++,
    date: new Date().toISOString(),
    tableId: currentTable,
    table: tableName(currentTable),
    lines: order.lines.map((l) => ({ ...l })),
    discountRate: order.discount || 0,
    note: order.note || '',
    ...t,
    method,
    given,
    change: given - t.total,
  };
  state.sales.push(sale);
  delete state.orders[currentTable];
  save();
  payDialog.close();
  printReceipt(sale, false);
  toast(`Çek №${sale.no} bağlandı — ${money(sale.total)}`);
  showView('tables');
});

// ---------- Çek ----------
function buildReceiptData(order, sale) {
  return sale || { ...calc(order), lines: order.lines, table: tableName(order.tableId), discountRate: order.discount, note: order.note, date: new Date().toISOString() };
}

function printReceipt(r, isBill) {
  const s = state.settings;
  $('#receipt').innerHTML = `
    <h3>${esc(s.name)}</h3>
    ${s.address ? `<div class="c">${esc(s.address)}</div>` : ''}
    <hr>
    <div>${isBill ? 'HESAB (ödənilməyib)' : 'Çek №' + r.no}</div>
    <div>${fmtDateTime(r.date)} · ${esc(r.table)}</div>
    <hr>
    <table>${r.lines.map((l) => `<tr><td>${esc(l.name)}<br>${l.qty} x ${(l.price / 100).toFixed(2)}</td><td class="r">${(l.price * l.qty / 100).toFixed(2)}</td></tr>`).join('')}</table>
    <hr>
    <table>
      <tr><td>Cəm</td><td class="r">${money(r.subtotal)}</td></tr>
      ${r.discount ? `<tr><td>Endirim ${r.discountRate}%</td><td class="r">−${money(r.discount)}</td></tr>` : ''}
      ${r.service ? `<tr><td>Xidmət ${r.serviceRate}%</td><td class="r">${money(r.service)}</td></tr>` : ''}
      <tr class="big"><td>YEKUN</td><td class="r">${money(r.total)}</td></tr>
      ${!isBill ? `<tr><td>Ödəniş</td><td class="r">${esc(r.method)}</td></tr>` : ''}
      ${!isBill && r.method === 'Nağd' ? `<tr><td>Alındı</td><td class="r">${money(r.given)}</td></tr><tr><td>Qalıq</td><td class="r">${money(r.change)}</td></tr>` : ''}
    </table>
    ${r.note ? `<hr><div>Qeyd: ${esc(r.note)}</div>` : ''}
    <hr>
    <div class="c">${esc(s.footer)}</div>`;
  setTimeout(() => window.print(), 50);
}

// ---------- Menyu idarəsi ----------
function renderMenuAdmin() {
  $('#catList').innerHTML = [...new Set(state.menu.map((m) => m.cat))].map((c) => `<option value="${esc(c)}">`).join('');
  const sorted = [...state.menu].sort((a, b) => a.cat.localeCompare(b.cat, 'az') || a.name.localeCompare(b.name, 'az'));
  const tbody = $('#menuTable tbody');
  tbody.innerHTML = sorted.map((m) => `<tr class="${m.active ? '' : 'inactive'}">
      <td>${esc(m.name)}</td><td>${esc(m.cat)}</td><td class="num">${money(m.price)}</td>
      <td><input type="checkbox" data-act="toggle" data-id="${m.id}" ${m.active ? 'checked' : ''}></td>
      <td><button class="link" data-act="edit" data-id="${m.id}">Redaktə</button>
          <button class="link" data-act="del" data-id="${m.id}">Sil</button></td></tr>`).join('');
}

$('#menuTable').addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const item = state.menu.find((m) => m.id === el.dataset.id);
  if (!item) return;
  if (el.dataset.act === 'toggle') {
    item.active = el.checked;
  } else if (el.dataset.act === 'edit') {
    $('#itemId').value = item.id;
    $('#itemName').value = item.name;
    $('#itemCat').value = item.cat;
    $('#itemPrice').value = (item.price / 100).toFixed(2);
    $('#itemName').focus();
    return;
  } else if (el.dataset.act === 'del') {
    if (!confirm(`"${item.name}" silinsin?`)) return;
    state.menu = state.menu.filter((m) => m !== item);
  }
  save();
  renderMenuAdmin();
});

$('#itemForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const id = $('#itemId').value;
  const data = { name: $('#itemName').value.trim(), cat: $('#itemCat').value.trim(), price: toQ($('#itemPrice').value) };
  if (!data.name || !data.cat) return;
  if (id) Object.assign(state.menu.find((m) => m.id === id), data);
  else state.menu.push({ id: 'm' + uid(), active: true, ...data });
  save();
  e.target.reset();
  $('#itemId').value = '';
  renderMenuAdmin();
  toast('Məhsul yadda saxlanıldı');
});
$('#itemFormReset').addEventListener('click', () => { $('#itemForm').reset(); $('#itemId').value = ''; });

// ---------- Hesabat ----------
function reportSales() {
  const from = $('#repFrom').value;
  const to = $('#repTo').value;
  return state.sales.filter((s) => {
    const d = localDate(new Date(s.date));
    return (!from || d >= from) && (!to || d <= to);
  });
}

function runReport() {
  if (!$('#repFrom').value) $('#repFrom').value = localDate(new Date());
  if (!$('#repTo').value) $('#repTo').value = localDate(new Date());
  const sales = reportSales();
  const sum = (f) => sales.reduce((s, x) => s + f(x), 0);
  const total = sum((s) => s.total);
  const cash = sum((s) => (s.method === 'Nağd' ? s.total : 0));
  const card = sum((s) => (s.method === 'Kart' ? s.total : 0));
  const stat = (label, value) => `<div class="stat"><div class="s-label">${label}</div><div class="s-value">${value}</div></div>`;
  $('#repStats').innerHTML =
    stat('Ümumi satış', money(total)) +
    stat('Nağd', money(cash)) +
    stat('Kart', money(card)) +
    stat('Çek sayı', sales.length) +
    stat('Orta çek', money(sales.length ? Math.round(total / sales.length) : 0)) +
    stat('Endirimlər', money(sum((s) => s.discount)));

  const byItem = {};
  sales.forEach((s) => s.lines.forEach((l) => {
    const r = byItem[l.name] || (byItem[l.name] = { qty: 0, amount: 0 });
    r.qty += l.qty;
    r.amount += l.qty * l.price;
  }));
  const top = Object.entries(byItem).sort((a, b) => b[1].qty - a[1].qty).slice(0, 15);
  $('#repTop tbody').innerHTML = top.length
    ? top.map(([n, r]) => `<tr><td>${esc(n)}</td><td class="num">${r.qty}</td><td class="num">${money(r.amount)}</td></tr>`).join('')
    : '<tr><td colspan="3" class="muted">Satış yoxdur</td></tr>';

  $('#repSales tbody').innerHTML = sales.length
    ? [...sales].reverse().map((s) => `<tr><td>${s.no}</td><td>${fmtDateTime(s.date)}</td><td>${esc(s.table)}</td>
        <td>${esc(s.method)}</td><td class="num">${money(s.total)}</td>
        <td><button class="link" data-reprint="${s.id}">Çap</button></td></tr>`).join('')
    : '<tr><td colspan="6" class="muted">Satış yoxdur</td></tr>';
}

$('#repSales').addEventListener('click', (e) => {
  const id = e.target.dataset.reprint;
  const sale = id && state.sales.find((s) => s.id === id);
  if (sale) printReceipt(sale, false);
});
$('#repRun').addEventListener('click', runReport);
$('#repToday').addEventListener('click', () => {
  $('#repFrom').value = $('#repTo').value = localDate(new Date());
  runReport();
});
$('#repCsv').addEventListener('click', () => {
  const rows = [['Çek', 'Tarix', 'Masa', 'Məhsul', 'Say', 'Qiymət', 'Məbləğ', 'Ödəniş']];
  reportSales().forEach((s) => s.lines.forEach((l) =>
    rows.push([s.no, fmtDateTime(s.date), s.table, l.name, l.qty, (l.price / 100).toFixed(2), (l.price * l.qty / 100).toFixed(2), s.method])));
  const csv = '﻿' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  download(`satis_${$('#repFrom').value}_${$('#repTo').value}.csv`, csv, 'text/csv');
});

function download(filename, content, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- Ayarlar ----------
function fillSettings() {
  const s = state.settings;
  $('#setName').value = s.name;
  $('#setAddress').value = s.address;
  $('#setTables').value = s.tables;
  $('#setService').value = s.service;
  $('#setFooter').value = s.footer;
}

$('#settingsForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const tables = Math.max(1, Math.min(200, parseInt($('#setTables').value, 10) || 1));
  const openAbove = Object.keys(state.orders).filter((id) => id !== 'paket' && +id.slice(1) > tables && state.orders[id].lines.length);
  if (openAbove.length) {
    toast('Açıq sifarişi olan masaları silmək olmaz: ' + openAbove.map(tableName).join(', '));
    return;
  }
  Object.assign(state.settings, {
    name: $('#setName').value.trim() || 'Çay Evi',
    address: $('#setAddress').value.trim(),
    tables,
    service: Math.max(0, Math.min(100, parseFloat($('#setService').value) || 0)),
    footer: $('#setFooter').value.trim(),
  });
  save();
  applyBrand();
  toast('Ayarlar yadda saxlanıldı');
});

$('#backupBtn').addEventListener('click', () =>
  download(`cayevi_ehtiyat_${localDate(new Date())}.json`, JSON.stringify(state, null, 2), 'application/json'));

$('#restoreInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data.menu || !data.settings || !Array.isArray(data.sales)) throw new Error('Fayl formatı yanlışdır');
    if (!confirm('Mövcud məlumatlar əvəz ediləcək. Davam edilsin?')) return;
    state = Object.assign(defaultState(), data);
    save();
    applyBrand();
    fillSettings();
    toast('Məlumatlar bərpa edildi');
  } catch (err) {
    toast('Bərpa alınmadı: ' + err.message);
  }
});

$('#clearSales').addEventListener('click', () => {
  if (!confirm('Bütün satış tarixçəsi silinsin? Bu əməliyyat geri qaytarılmır.')) return;
  state.sales = [];
  state.nextReceipt = 1;
  save();
  toast('Satış tarixçəsi silindi');
});

// ---------- Başlanğıc ----------
function applyBrand() {
  $('#brandName').textContent = state.settings.name;
  document.title = state.settings.name + ' — Satış';
}

function tick() {
  const d = new Date();
  $('#clock').textContent = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

applyBrand();
tick();
setInterval(tick, 10000);
renderTables();
