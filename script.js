const storageKey = 'cuy-dorado-canjes';
const knownUsersKey = 'cuy-dorado-known-users';
const sheetUrlKey = 'cuy-dorado-sheet-url';
const defaultSheetUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQfZIssL0S5aOizwvYoCamhsTTuc7UlOxmFBV2G3N63kJ4pB1gDo1asZ_-7K9YWGs1Hl6MhMdKu76dn/pubhtml';
const recordsSheetGid = '1871391364';
const statusOverrideKey = 'cuy-dorado-status-overrides';
const statusPasswordKey = 'cuy-dorado-status-password';
const defaultStatusPassword = '021422';
const demoRows = [
  { date: '12/09/2026 17:20', code: 'CD7F3K9L', status: 'Ganador', prize: 'S/ 2.00', user: 'Juan P.', method: 'Yape' },
  { date: '12/09/2026 17:18', code: 'A8K2M1Q5', status: 'No ganador', prize: '-', user: 'María L.', method: '-' },
  { date: '12/09/2026 17:15', code: 'Z9P4T6V1', status: 'Pendiente', prize: '-', user: 'Carlos R.', method: '-' },
  { date: '12/09/2026 17:12', code: 'M3N7B5C8', status: 'No ganador', prize: '-', user: 'Lucía S.', method: '-' },
  { date: '12/09/2026 17:10', code: 'Q2W6E8R4', status: 'Ganador', prize: 'S/ 0.50', user: 'Diego M.', method: 'Plin' },
  { date: '12/09/2026 17:08', code: 'L9K3D7F2', status: 'Ganador', prize: 'S/ 1.00', user: 'Ana T.', method: 'Yape' },
  { date: '12/09/2026 17:05', code: 'H5G8J1P0', status: 'No ganador', prize: '-', user: 'Luis V.', method: '-' }
];

let rows = [];
let knownUsers = JSON.parse(localStorage.getItem(knownUsersKey) || 'null');
let pendingUserAlerts = [];
const statusOverrides = JSON.parse(localStorage.getItem(statusOverrideKey) || '{}');
let statusPassword = localStorage.getItem(statusPasswordKey) || defaultStatusPassword;
let codesRows = [];
let activeCodeSheet = 0;
const codeSheets = {};
let codesPage = 1;
const codesPageSize = 25;
const toast = document.querySelector('.toast');
const tableBody = document.querySelector('tbody');
const fileInput = document.querySelector('#excel-input');
const dialog = document.querySelector('#entry-dialog');
const userDialog = document.querySelector('#user-dialog');
const keyDialog = document.querySelector('#key-dialog');
let pendingStatusChange = null;
const loginScreen = document.querySelector('#login-screen');
const appShell = document.querySelector('.app-shell');

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(window.toastTimer);
  window.toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2200);
}

function setLoggedIn(loggedIn) {
  loginScreen.hidden = loggedIn;
  appShell.hidden = !loggedIn;
  if (!loggedIn) document.querySelector('#login-form').reset();
}

function saveRows() {
  localStorage.setItem(storageKey, JSON.stringify(rows));
  document.querySelector('#data-status').textContent = `${rows.length} registros guardados en este navegador`;
}

function updateUserAlerts(nextRows) {
  const currentUsers = [...new Set(nextRows.map((row) => String(row.user || '').trim()).filter(Boolean))];
  if (knownUsers === null) {
    knownUsers = currentUsers;
    localStorage.setItem(knownUsersKey, JSON.stringify(knownUsers));
    return;
  }
  const previousUsers = new Set(knownUsers);
  pendingUserAlerts = currentUsers
    .filter((user) => !previousUsers.has(user))
    .map((user) => nextRows.find((row) => String(row.user || '').trim() === user))
    .filter(Boolean)
    .concat(pendingUserAlerts.filter((row) => !currentUsers.includes(String(row.user || '').trim())));
  knownUsers = currentUsers;
  localStorage.setItem(knownUsersKey, JSON.stringify(knownUsers));
  const count = document.querySelector('#notification-count');
  count.textContent = pendingUserAlerts.length;
  count.hidden = pendingUserAlerts.length === 0;
}

function renderUserAlerts() {
  const list = document.querySelector('#notification-list');
  if (!pendingUserAlerts.length) {
    list.innerHTML = '<p>No hay usuarios nuevos.</p>';
    return;
  }
  list.innerHTML = pendingUserAlerts.map((row) => `<div class="notification-item"><b>Nuevo usuario registrado</b><span>${escapeHtml(row.user)}</span><small>${escapeHtml(row.date)}</small></div>`).join('');
}

function updateHeaderDate() {
  const now = new Date();
  document.querySelector('#current-date').textContent = now.toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
  document.querySelector('#last-updated').textContent = `Última actualización: ${now.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`;
}

function saveStatusOverrides() {
  localStorage.setItem(statusOverrideKey, JSON.stringify(statusOverrides));
}

function statusClass(status = '') {
  const normalized = status.toLowerCase();
  if (normalized.includes('pendiente')) return 'pending';
  if (normalized.includes('pagado') || normalized.includes('ganador')) return 'success';
  if (normalized.includes('no pagar')) return 'fail';
  return 'fail';
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function normalizeRow(row) {
  const value = (keys) => {
    const key = Object.keys(row).find((candidate) => keys.some((wanted) => candidate.toLowerCase().replace(/[ _-]/g, '').includes(wanted)));
    return key ? String(row[key] ?? '').trim() : '';
  };
  const code = value(['codigo', 'código', 'code']);
  const prize = value(['premio', 'prize']);
  const hasPrize = prize && prize !== '-';
  return {
    date: value(['fecha', 'hora', 'date']) || new Date().toLocaleString('es-PE'),
    code,
    status: statusOverrides[code.toLowerCase()] || (hasPrize ? 'Pendiente' : 'No Pagar'),
    prize: prize || '-',
    user: value(['usuario', 'nombre', 'user']),
    phone: value(['celular', 'telefono', 'teléfono', 'phone']),
    email: value(['correo', 'email', 'mail']),
    method: value(['metodo', 'método', 'pago', 'method']) || '-'
  };
}

function normalizeCodeRow(row) {
  const value = (keys) => {
    const key = Object.keys(row).find((candidate) => keys.some((wanted) => candidate.toLowerCase().replace(/[ _-]/g, '').includes(wanted)));
    return key ? String(row[key] ?? '').trim() : '';
  };
  const redeemed = value(['canje']).toLowerCase();
  return { code: value(['codigo', 'código', 'code']), prize: value(['monto', 'premio', 'prize']) || 'S/ 0.00', redeemed: redeemed.includes('canje') };
}

function enrichRowsWithPrizes(codeRows) {
  const prizesByCode = new Map(codeRows.filter((row) => row.code && row.prize && row.prize !== 'S/ 0.00').map((row) => [row.code.toLowerCase(), row.prize]));
  let changed = false;
  rows.forEach((row) => {
    const prize = prizesByCode.get(String(row.code || '').toLowerCase());
    if (!prize || (row.prize && row.prize !== '-')) return;
    row.prize = prize;
    if (row.status === 'No Pagar') row.status = 'Pendiente';
    changed = true;
  });
  if (changed) renderRows();
}

function updatePaymentSummary() {
  const donut = document.querySelector('[data-payment-donut]');
  const legend = document.querySelector('[data-payment-legend]');
  if (!donut || !legend) return;
  const methods = [
    { name: 'Yape', color: '#8a45d3', className: 'purple-bg', count: 0 },
    { name: 'Plin', color: '#39bbca', className: 'cyan-bg', count: 0 },
    { name: 'Transferencia', color: '#a7b1b8', className: 'gray-bg', count: 0 },
    { name: 'Otro', color: '#ffbf23', className: 'yellow-bg', count: 0 }
  ];
  rows.forEach((row) => {
    const method = String(row.method || '').trim().toLowerCase();
    if (!method || method === '-') return;
    const match = methods.find((item) => method.includes(item.name.toLowerCase()));
    (match || methods[3]).count += 1;
  });
  const total = methods.reduce((sum, method) => sum + method.count, 0);
  let start = 0;
  const segments = methods.map((method) => {
    const percentage = total ? (method.count / total) * 100 : 0;
    const segment = `${method.color} ${start}% ${start + percentage}%`;
    start += percentage;
    return segment;
  });
  donut.style.background = total ? `conic-gradient(${segments.join(', ')})` : '#e5e1dd';
  donut.querySelector('div').textContent = total.toLocaleString('es-PE');
  legend.innerHTML = methods.map((method) => {
    const percentage = total ? Math.round(method.count / total * 100) : 0;
    return `<div><i class="${method.className}"></i>${method.name} <b>${percentage}%</b></div>`;
  }).join('');
}

function updateStatusSummary() {
  const donut = document.querySelector('.status-panel .donut');
  const legend = document.querySelector('.status-panel .legend');
  if (!donut || !legend) return;
  const statuses = [
    { name: 'Ganadores', key: 'success', color: '#19b86d', className: 'green-bg' },
    { name: 'No ganadores', key: 'fail', color: '#f04446', className: 'red-bg' },
    { name: 'Pendientes', key: 'pending', color: '#ffbf23', className: 'yellow-bg' }
  ].map((status) => ({ ...status, count: rows.filter((row) => statusClass(row.status) === status.key).length }));
  const total = statuses.reduce((sum, status) => sum + status.count, 0);
  let start = 0;
  const segments = statuses.map((status) => {
    const percentage = total ? status.count / total * 100 : 0;
    const segment = `${status.color} ${start}% ${start + percentage}%`;
    start += percentage;
    return segment;
  });
  donut.style.background = total ? `conic-gradient(${segments.join(', ')})` : '#e5e1dd';
  donut.querySelector('b').textContent = total.toLocaleString('es-PE');
  legend.innerHTML = statuses.map((status) => {
    const percentage = total ? (status.count / total * 100).toFixed(1) : '0.0';
    return `<div><i class="dot ${status.className}"></i>${status.name} <b>${status.count.toLocaleString('es-PE')} <small>(${percentage}%)</small></b></div>`;
  }).join('');
}

function parseRowDate(value) {
  const match = String(value || '').match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (!match) return null;
  const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function updateDailyChart(days = 7) {
  const chart = document.querySelector('.bar-chart');
  if (!chart) return;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dates = Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - days + index + 1);
    return date;
  });
  const daily = dates.map((date) => {
    const key = localDateKey(date);
    const counts = { success: 0, fail: 0, pending: 0 };
    rows.forEach((row) => {
      const rowDate = parseRowDate(row.date);
      if (rowDate && localDateKey(rowDate) === key) counts[statusClass(row.status)] += 1;
    });
    return { date, counts };
  });
  const maximum = Math.max(1, ...daily.flatMap((item) => Object.values(item.counts)));
  chart.innerHTML = `<div class="y-labels"><span>${maximum}</span><span>${Math.round(maximum * .8)}</span><span>${Math.round(maximum * .6)}</span><span>${Math.round(maximum * .4)}</span><span>${Math.round(maximum * .2)}</span><span>0</span></div><div class="bars">${daily.map((item) => `<div class="bar-group"><i class="bar green-bar" style="height:${item.counts.success / maximum * 100}%"></i><i class="bar red-bar" style="height:${item.counts.fail / maximum * 100}%"></i><i class="bar yellow-bar" style="height:${item.counts.pending / maximum * 100}%"></i><span>${item.date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }).replace('.', '')}</span></div>`).join('')}</div>`;
}

function renderRows(showAll = false) {
  document.querySelector('.table-panel thead tr').innerHTML = '<th>Fecha y hora</th><th>Código</th><th>Nombre</th><th>Celular</th><th>Correo</th><th>Estado</th><th>Premio</th><th>Método</th>';
  const visibleRows = showAll ? rows : rows.slice(0, 100);
  tableBody.innerHTML = visibleRows.map((row) => rowHtml(row)).join('');
  const total = rows.length;
  document.querySelector('#metric-total').textContent = total.toLocaleString('es-PE');
  document.querySelector('#metric-winners').textContent = rows.filter((row) => statusClass(row.status) === 'success').length.toLocaleString('es-PE');
  document.querySelector('#metric-losers').textContent = rows.filter((row) => statusClass(row.status) === 'fail').length.toLocaleString('es-PE');
  document.querySelector('#metric-pending').textContent = rows.filter((row) => statusClass(row.status) === 'pending').length.toLocaleString('es-PE');
  document.querySelector('.donut b').textContent = total.toLocaleString('es-PE');
  updateStatusSummary();
  updatePaymentSummary();
  const chartRange = document.querySelector('.chart-panel select')?.value || 'Últimos 7 días';
  updateDailyChart(chartRange.includes('30') ? 30 : 7);
  updateUserAlerts(rows);
  saveRows();
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const separator = lines[0].includes(';') ? ';' : ',';
  const headers = lines.shift().split(separator).map((header) => header.trim().replace(/^"|"$/g, ''));
  return lines.map((line) => {
    const columns = line.split(separator).map((column) => column.trim().replace(/^"|"$/g, ''));
    return Object.fromEntries(headers.map((header, index) => [header, columns[index] || '']));
  });
}

function importFile(file) {
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      let imported;
      if (file.name.toLowerCase().endsWith('.csv')) imported = parseCsv(event.target.result);
      else if (window.XLSX) {
        const workbook = XLSX.read(event.target.result, { type: 'array' });
        imported = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
      } else throw new Error('Guarda el Excel como CSV si no hay conexión a internet.');
      const cleanRows = imported.map(normalizeRow).filter((row) => row.code || row.user);
      if (!cleanRows.length) throw new Error('No encontré filas con código o usuario.');
      rows = cleanRows;
      renderRows();
      document.querySelector('#data-status').textContent = `${file.name} · ${cleanRows.length} registros importados`;
      showToast(`${cleanRows.length} registros importados correctamente`);
    } catch (error) {
      showToast(error.message);
    }
  };
  reader.onerror = () => showToast('No se pudo leer el archivo');
  if (file.name.toLowerCase().endsWith('.csv')) reader.readAsText(file, 'UTF-8');
  else reader.readAsArrayBuffer(file);
}

function sheetCsvUrl(value, gid = null) {
  const publishedMatch = value.match(/spreadsheets\/d\/e\/([a-zA-Z0-9-_]+)/);
  if (publishedMatch) {
    const publishedGid = gid ?? ((value.match(/[?&#]gid=([0-9]+)/) || [])[1] || '0');
    return `https://docs.google.com/spreadsheets/d/e/${publishedMatch[1]}/pub?output=csv&gid=${publishedGid}`;
  }
  const match = value.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) return value;
  const sheetGid = gid ?? ((value.match(/[?&#]gid=([0-9]+)/) || [])[1] || '0');
  return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=${sheetGid}`;
}

function codesSheetCsvUrl(value, gid = 0) {
  const publishedMatch = value.match(/spreadsheets\/d\/e\/([a-zA-Z0-9-_]+)/);
  if (publishedMatch) return `https://docs.google.com/spreadsheets/d/e/${publishedMatch[1]}/pub?output=csv&gid=${gid}`;
  const match = value.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=${gid}`;
  return value;
}

function liveCsvUrl(url) {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}_live=${Date.now()}`;
}

async function fetchSheetCsv(url) {
  const directUrl = liveCsvUrl(url);
  try {
    const response = await fetch(directUrl, { cache: 'no-store', mode: 'cors' });
    if (response.ok) return response;
  } catch (error) {
    // Reintenta con la URL directa si el navegador rechaza el parámetro anti-cache.
  }
  const fallback = await fetch(url, { cache: 'no-store', mode: 'cors' });
  if (!fallback.ok) throw new Error('La hoja no está disponible');
  return fallback;
}

function parseCodesCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 3) return [];
  const separator = lines[0].includes(';') ? ';' : ',';
  const headers = lines[1].split(separator).map((header, index) => header.trim().replace(/^"|"$/g, '') || (index === 2 ? 'Canje' : `Columna ${index + 1}`));
  return lines.slice(2).map((line) => {
    const columns = line.split(separator).map((column) => column.trim().replace(/^"|"$/g, ''));
    return Object.fromEntries(headers.map((header, index) => [header, columns[index] || '']));
  });
}

async function syncCodesSheet(gid = activeCodeSheet) {
  const configuredUrl = localStorage.getItem(sheetUrlKey) || defaultSheetUrl;
  if (!configuredUrl) return;
  try {
    const response = await fetchSheetCsv(codesSheetCsvUrl(configuredUrl, gid));
    const redeemedByCode = new Map(rows.filter((row) => row.code).map((row) => [row.code.toLowerCase(), row.user || 'Usuario registrado']));
    const importedCodes = parseCodesCsv(await response.text()).map(normalizeCodeRow).filter((row) => row.code).map((row) => {
      const user = redeemedByCode.get(row.code.toLowerCase());
      return user ? { ...row, redeemed: true, redeemedBy: user } : row;
    });
    codeSheets[gid] = importedCodes;
    enrichRowsWithPrizes(importedCodes);
    if (gid !== activeCodeSheet) return;
    codesRows = importedCodes;
    updateDashboardPrizes();
    const activeView = document.querySelector('.nav-item.active')?.dataset.view;
    if (activeView === 'Códigos' || activeView === 'Premios') renderIndependentView(activeView);
  } catch (error) {
    if (document.querySelector('.nav-item.active')?.dataset.view === 'Códigos') showToast('No se pudo leer la pestaña Hoja 1');
  }
}

async function syncGoogleSheet(showMessage = false) {
  const configuredUrl = localStorage.getItem(sheetUrlKey) || defaultSheetUrl;
  if (!configuredUrl) return;
  try {
    const response = await fetchSheetCsv(sheetCsvUrl(configuredUrl, recordsSheetGid));
    const imported = parseCsv(await response.text());
    const cleanRows = imported.map(normalizeRow).filter((row) => row.code || row.user);
    if (!cleanRows.length) throw new Error('La pestaña Registros no contiene filas válidas');
    const previousCount = rows.length;
    rows = cleanRows;
    renderRows();
    updateHeaderDate();
    const activeView = document.querySelector('.nav-item.active')?.dataset.view;
    if (activeView && activeView !== 'Inicio') renderIndependentView(activeView);
    document.querySelector('#data-status').textContent = `Google Sheets sincronizado · ${cleanRows.length} registros · actualizado ${new Date().toLocaleTimeString('es-PE')}`;
    if (showMessage || cleanRows.length !== previousCount) showToast(`Hoja sincronizada: ${cleanRows.length} registros`);
    await syncCodesSheet();
  } catch (error) {
    document.querySelector('#data-status').textContent = rows.length
      ? `Datos guardados · ${rows.length} registros · no se pudo actualizar`
      : 'No se pudo sincronizar la hoja';
    if (showMessage) showToast('Revisa que la hoja esté publicada para cualquiera con el enlace');
  }
}

function configureSheet() {
  const input = independentView.querySelector('[data-sheet-url]');
  const value = input.value.trim();
  if (!value) {
    localStorage.removeItem(sheetUrlKey);
    showToast('Enlace de Google Sheets eliminado');
    return;
  }
  localStorage.setItem(sheetUrlKey, sheetCsvUrl(value));
  syncGoogleSheet(true);
}

const dashboardParts = ['.metrics-grid', '.analytics-grid', '.lower-grid', 'footer'];
const independentView = document.querySelector('#independent-view');

function uniqueUsers() {
  return [...new Set(rows.map((row) => row.user).filter(Boolean))];
}

function renderIndependentView(view) {
  const views = {
    'Códigos': `<section class="independent-grid"><article class="panel full-panel"><div class="panel-heading"><div><h2>Códigos registrados</h2><p>${codesRows.length} códigos · ${codesRows.filter((row) => !row.redeemed).length} disponibles</p></div><button class="action-button primary" data-action="sync-codes">↻ Actualizar</button></div><input class="view-search" data-search placeholder="Buscar por código o premio"><div class="table-wrap"><table><thead><tr><th>Código</th><th>Premio</th><th>Canje</th></tr></thead><tbody>${pagedCodeRows().map((row) => codeRowHtml(row)).join('')}</tbody></table></div><div class="code-pagination"><button class="page-button" data-page-action="previous">‹ Anterior</button><span>Página ${codesPage} de ${totalCodePages()}</span><button class="page-button" data-page-action="next">Siguiente ›</button></div></article></section>`,
    'Canjes': `<section class="independent-grid"><article class="panel action-panel"><h2>Registrar un canje</h2><p>Valida y guarda un código en tu base local.</p><button class="action-button primary" data-action="new-code">＋ Abrir formulario</button></article><article class="panel action-panel"><h2>Resumen de canjes</h2><div class="big-number">${rows.length}</div><p>canjes registrados actualmente</p><button class="action-button secondary" data-action="show-codes">Ver todos los canjes</button></article></section>`,
    'Premios': `<section class="independent-grid"><article class="panel full-panel"><div class="panel-heading"><div><h2>Premios reales</h2><p>${codesRows.length} códigos cargados desde Hoja 1</p></div><button class="action-button primary" data-action="sync-codes">↻ Actualizar premios</button></div><div class="summary-cards">${prizeSummary().map((prize) => `<div class="mini-summary"><span>🪙</span><b>${escapeHtml(prize.amount)}</b><small>${prize.total} códigos · ${prize.redeemed} canjeados</small></div>`).join('') || '<p>No hay premios cargados todavía.</p>'}</div></article></section>`,
    'Usuarios': `<section class="independent-grid"><article class="panel full-panel"><div class="panel-heading"><div><h2>Usuarios registrados</h2><p>Presiona un usuario para ver su información</p></div><button class="action-button primary" data-action="export">⇩ Exportar lista</button></div><div class="user-list">${uniqueUsers().map((user, index) => `<button class="user-row" data-user-index="${rows.findIndex((row) => row.user === user)}"><span class="avatar">${escapeHtml(user.charAt(0).toUpperCase())}</span><span><b>${escapeHtml(user)}</b><small>${rows.filter((row) => row.user === user).length} canje(s) registrado(s)</small></span><strong>${index + 1}</strong></button>`).join('') || '<p>No hay usuarios registrados todavía.</p>'}</div></article></section>`,
    'Reportes': `<section class="independent-grid"><article class="panel full-panel"><div class="panel-heading"><div><h2>Reporte de actividad</h2><p>Resumen calculado desde tus datos actuales</p></div><button class="action-button secondary" data-action="export">⇩ Descargar reporte</button></div><div class="report-bars">${['Ganadores', 'No ganadores', 'Pendientes'].map((status) => { const count = rows.filter((row) => statusClass(row.status) === statusClass(status)).length; const width = rows.length ? Math.max(6, count / rows.length * 100) : 6; return `<div><span>${status}</span><i><b style="width:${width}%"></b></i><strong>${count}</strong></div>`; }).join('')}</div></article></section>`,
    'Configuración': `<section class="independent-grid"><article class="panel settings-panel"><h2>Configuración general</h2><label>Nombre del negocio<input value="Cuy Dorado"></label><label>Moneda<select><option>Soles (S/)</option><option>Dólares ($)</option></select></label><label class="switch-row">Guardar datos localmente <input type="checkbox" checked><span class="switch"></span></label><button class="action-button primary" data-action="save-settings">Guardar configuración</button></article><article class="panel settings-panel"><h2>Google Sheets</h2><p>El enlace queda guardado. Usa “Actualizar datos” cuando quieras consultar cambios.</p><input data-sheet-url placeholder="https://docs.google.com/spreadsheets/d/..." value="${localStorage.getItem(sheetUrlKey) || defaultSheetUrl}"><button class="action-button primary" data-action="connect-sheet">Guardar enlace de Google Sheet</button><button class="action-button secondary" data-action="clear-data">Limpiar datos locales</button></article></section>`
  };
  independentView.innerHTML = views[view] || '';
  independentView.hidden = view === 'Inicio';
  dashboardParts.forEach((selector) => { document.querySelector(selector).hidden = view !== 'Inicio'; });
  if (view === 'Códigos') independentView.querySelector('[data-search]').addEventListener('input', filterCodeTable);
  independentView.querySelectorAll('[data-page-action]').forEach((button) => button.addEventListener('click', () => changeCodesPage(button.dataset.pageAction)));
  independentView.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => handleViewAction(button.dataset.action)));
  independentView.querySelectorAll('[data-user-index]').forEach((userButton) => userButton.addEventListener('click', () => showUserDetails(Number(userButton.dataset.userIndex))));
}

function totalCodePages() {
  return Math.max(1, Math.ceil(codesRows.length / codesPageSize));
}

function pagedCodeRows() {
  const start = (codesPage - 1) * codesPageSize;
  return codesRows.slice(start, start + codesPageSize);
}

function changeCodesPage(direction) {
  const nextPage = direction === 'next' ? codesPage + 1 : codesPage - 1;
  codesPage = Math.min(Math.max(nextPage, 1), totalCodePages());
  renderIndependentView('Códigos');
}

function selectCodeSheet(sheetIndex) {
  activeCodeSheet = sheetIndex;
  codesRows = codeSheets[sheetIndex] || [];
  renderIndependentView('Códigos');
  syncCodesSheet(sheetIndex);
}

function rowHtml(row) {
  const status = row.status || 'Pendiente';
  return `<tr><td>${escapeHtml(row.date)}</td><td>${escapeHtml(row.code || '-')}</td><td>${escapeHtml(row.user || '-')}</td><td>${escapeHtml(row.phone || '-')}</td><td>${escapeHtml(row.email || '-')}</td><td><span class="status ${statusClass(status)}">● ${escapeHtml(status)}</span></td><td>${escapeHtml(row.prize || '-')}</td><td>${escapeHtml(row.method || '-')}</td></tr>`;
}

function codeRowHtml(row) {
  const status = row.redeemed ? 'Canjeado' : 'Disponible';
  return `<tr><td>${escapeHtml(row.code)}</td><td>${escapeHtml(row.prize)}</td><td><span class="status ${row.redeemed ? 'fail' : 'success'}">● ${status}</span></td></tr>`;
}

function showUserDetails(index) {
  const selected = rows[index];
  if (!selected) return;
  const userRows = rows.filter((row) => row.user === selected.user);
  const isPaid = ['pagado', 'ganador'].includes((selected.status || '').toLowerCase());
  document.querySelector('#user-details').innerHTML = `<div class="user-profile"><span class="large-avatar">${escapeHtml((selected.user || '?').charAt(0).toUpperCase())}</span><div><h3>${escapeHtml(selected.user || 'Sin nombre')}</h3><p>${escapeHtml(selected.email || 'Correo no registrado')}</p></div></div><div class="user-info-grid"><div><small>Celular</small><b>${escapeHtml(selected.phone || 'No registrado')}</b></div><div><small>Canjes</small><b>${userRows.length}</b></div><div><small>Códigos</small><b>${escapeHtml(userRows.map((row) => row.code).join(', ') || '-')}</b></div><div><small>Premios</small><b>${escapeHtml(userRows.map((row) => row.prize).filter((prize) => prize && prize !== '-').join(', ') || 'Sin premio')}</b></div><div><small>Pagar por</small><b>${escapeHtml(selected.method || 'No registrado')}</b></div></div><div class="status-editor"><label>Estado de pago<select id="user-status"><option value="Pagado" ${isPaid ? 'selected' : ''}>Pagado</option><option value="Pendiente" ${!isPaid ? 'selected' : ''}>Pendiente</option></select></label><button class="action-button primary" id="save-user-status">Guardar cambios</button></div><div class="user-history"><h3>Historial</h3>${userRows.map((row) => `<div><span>${escapeHtml(row.date)}</span><b>${escapeHtml(row.code)}</b><em class="status ${statusClass(row.status)}">${escapeHtml(row.status)}</em><small>${escapeHtml(row.method || 'Sin método')}</small></div>`).join('')}</div>`;
  document.querySelector('#save-user-status').addEventListener('click', () => {
    const nextStatus = document.querySelector('#user-status').value;
    pendingStatusChange = { userRows, nextStatus };
    document.querySelector('#status-key-input').value = '';
    keyDialog.showModal();
  });
  userDialog.showModal();
}

function prizeSummary() {
  const grouped = new Map();
  codesRows.forEach((row) => {
    const current = grouped.get(row.prize) || { amount: row.prize, total: 0, redeemed: 0 };
    current.total += 1;
    if (row.redeemed) current.redeemed += 1;
    grouped.set(row.prize, current);
  });
  return [...grouped.values()].sort((first, second) => Number(second.amount.replace(/[^0-9.,]/g, '').replace(',', '.')) - Number(first.amount.replace(/[^0-9.,]/g, '').replace(',', '.')));
}

function updateDashboardPrizes() {
  const list = document.querySelector('.prize-list');
  const total = document.querySelector('.prize-panel .total strong');
  if (!list || !total) return;
  const summary = prizeSummary();
  list.innerHTML = summary.map((prize) => `<div><span>🪙</span>${escapeHtml(prize.amount)} <b>${prize.redeemed}</b></div>`).join('');
  const delivered = summary.reduce((sum, prize) => sum + (Number(prize.amount.replace(/[^0-9.,]/g, '').replace(',', '.')) * prize.redeemed), 0);
  total.textContent = `S/ ${delivered.toFixed(2)}`;
}

function filterCodeTable(event) {
  const query = event.target.value.toLowerCase();
  codesRows = (codeSheets[activeCodeSheet] || []).filter((row) => Object.values(row).join(' ').toLowerCase().includes(query));
  codesPage = 1;
  independentView.querySelector('tbody').innerHTML = pagedCodeRows().map(codeRowHtml).join('');
  independentView.querySelector('.code-pagination span').textContent = `Página ${codesPage} de ${totalCodePages()}`;
}

function handleViewAction(action) {
  if (action === 'new-code') dialog.showModal();
  if (action === 'show-codes') selectView('Códigos');
  if (action === 'save-settings') showToast('Configuración guardada correctamente');
  if (action === 'connect-sheet') configureSheet();
  if (action === 'sync-codes') syncCodesSheet(activeCodeSheet).then(() => { renderIndependentView('Códigos'); showToast(`Hoja ${activeCodeSheet + 1} actualizada`); });
  if (action === 'clear-data') { rows = []; Object.keys(statusOverrides).forEach((key) => delete statusOverrides[key]); saveStatusOverrides(); renderRows(); renderIndependentView('Configuración'); showToast('Datos eliminados del navegador'); }
  if (action === 'export') showToast('El reporte está listo para exportarse');
}

function selectView(view) {
  const item = [...document.querySelectorAll('.nav-item')].find((navItem) => navItem.dataset.view === view);
  if (!item) return;
  document.querySelectorAll('.nav-item').forEach((navItem) => navItem.classList.remove('active'));
  item.classList.add('active');
  document.querySelector('#view-title').textContent = view === 'Inicio' ? 'Resumen general' : view;
  renderIndependentView(view);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('.nav-item').forEach((item) => item.addEventListener('click', () => {
  selectView(item.dataset.view);
  showToast(`Sección: ${item.dataset.view}`);
}));

document.querySelector('#import-button').addEventListener('click', () => fileInput.click());
document.querySelector('#refresh-data-button').addEventListener('click', () => {
  const button = document.querySelector('#refresh-data-button');
  button.disabled = true;
  button.textContent = '↻ Actualizando...';
  syncGoogleSheet(true).finally(() => {
    button.disabled = false;
    button.textContent = '↻ Actualizar datos';
  });
});
fileInput.addEventListener('change', () => fileInput.files[0] && importFile(fileInput.files[0]));
document.querySelector('#add-button').addEventListener('click', () => dialog.showModal());
document.querySelector('.close-button').addEventListener('click', () => dialog.close());
document.querySelector('.dialog-actions [value="cancel"]').addEventListener('click', () => dialog.close());
document.querySelector('.user-close-button').addEventListener('click', () => userDialog.close());
document.querySelector('.key-close-button').addEventListener('click', () => keyDialog.close());
document.querySelector('.key-cancel-button').addEventListener('click', () => keyDialog.close());
document.querySelector('#key-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const enteredPassword = document.querySelector('#status-key-input').value;
  if (enteredPassword !== statusPassword) {
    showToast('Clave incorrecta. Estado no modificado');
    return;
  }
  pendingStatusChange.userRows.forEach((row) => {
    row.status = pendingStatusChange.nextStatus;
    if (pendingStatusChange.nextMethod) row.method = pendingStatusChange.nextMethod;
    if (row.code) statusOverrides[row.code.toLowerCase()] = pendingStatusChange.nextStatus;
  });
  saveStatusOverrides();
  renderRows();
  keyDialog.close();
  userDialog.close();
  showToast(`Usuario actualizado: ${pendingStatusChange.nextStatus}`);
  pendingStatusChange = null;
});
document.querySelector('#entry-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const prize = String(formData.get('prize') || '').trim();
  const newRow = { date: new Date().toLocaleString('es-PE'), code: formData.get('code'), user: formData.get('user'), phone: formData.get('phone') || '', email: formData.get('email') || '', status: prize && prize !== '-' ? 'Pendiente' : 'No Pagar', prize: prize || '-', method: formData.get('method') || '-' };
  rows.unshift(newRow);
  renderRows();
  dialog.close();
  event.currentTarget.reset();
  showToast('Canje guardado correctamente');
});
const recordsButton = document.querySelector('.text-button');
recordsButton.type = 'button';
recordsButton.style.position = 'relative';
recordsButton.style.zIndex = '2';
recordsButton.style.pointerEvents = 'auto';
recordsButton.addEventListener('click', () => {
  const query = window.prompt('Buscar en cualquier fila: código, usuario, celular, estado, premio o método', '')?.trim().toLowerCase() || '';
  const filteredRows = query
    ? rows.filter((row) => Object.values(row).join(' ').toLowerCase().includes(query))
    : rows;
  tableBody.innerHTML = filteredRows.map((row) => rowHtml(row)).join('');
  showToast(query ? `${filteredRows.length} fila(s) encontradas` : `${rows.length} códigos mostrados`);
});
const profileToggle = document.querySelector('#profile-toggle');
const profileDropdown = document.querySelector('#profile-dropdown');
const notificationsToggle = document.querySelector('#notifications-toggle');
const notificationDropdown = document.querySelector('#notification-dropdown');
profileToggle.addEventListener('click', () => profileDropdown.classList.toggle('open'));
notificationsToggle.addEventListener('click', () => {
  const willOpen = notificationDropdown.hidden;
  notificationDropdown.hidden = !willOpen;
  notificationsToggle.setAttribute('aria-expanded', String(willOpen));
  if (willOpen) {
    renderUserAlerts();
    pendingUserAlerts = [];
    document.querySelector('#notification-count').hidden = true;
  }
});
document.addEventListener('click', (event) => {
  if (!event.target.closest('.profile-menu-wrap')) profileDropdown.classList.remove('open');
  if (!event.target.closest('.notification-wrap')) {
    notificationDropdown.hidden = true;
    notificationsToggle.setAttribute('aria-expanded', 'false');
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') profileDropdown.classList.remove('open');
});
document.querySelector('[data-profile-action="settings"]').addEventListener('click', () => {
  profileDropdown.classList.remove('open');
  selectView('Configuración');
  showToast('Configuración abierta');
});
document.querySelector('[data-profile-action="logout"]').addEventListener('click', () => {
  sessionStorage.removeItem('cuy-dorado-session');
  setLoggedIn(false);
  profileDropdown.classList.remove('open');
  showToast('Sesión cerrada');
});
document.querySelector('.mobile-menu').addEventListener('click', () => showToast('Usa el menú lateral para navegar'));
document.querySelectorAll('select').forEach((select) => select.addEventListener('change', () => showToast(`Filtro: ${select.value}`)));
document.querySelector('.chart-panel select').addEventListener('change', (event) => updateDailyChart(event.target.value.includes('30') ? 30 : 7));

document.querySelector('#login-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const username = String(formData.get('username')).trim();
  const password = String(formData.get('password'));
  if (username.toLowerCase() !== 'gabriel' || password !== '021422') {
    document.querySelector('#login-error').textContent = 'Usuario o contraseña incorrectos';
    return;
  }
  sessionStorage.setItem('cuy-dorado-session', 'active');
  document.querySelector('#login-error').textContent = '';
  setLoggedIn(true);
});

renderRows();
updateHeaderDate();
setLoggedIn(sessionStorage.getItem('cuy-dorado-session') === 'active');
syncGoogleSheet();
syncCodesSheet();
