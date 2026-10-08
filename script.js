'use strict';

/* ═══════════════════════════════════════════════════════════════
   AL-SHIFA PHARMACY ERP — v4.0
   Firebase Auth + Barcode + Credit Bill WhatsApp
   © S_T_T_A_Software-Agency
   ═══════════════════════════════════════════════════════════════ */

/* ═══════════ CONSTANTS ═══════════ */
var LS_KEY = 'alshifa_v21';
var LEGACY_LS_KEY = 'alshifa_v20';
var SESSION_KEY = 'alshifa_session';
var POINTS_EARN_RATE = 100;
var POINTS_VALUE = 1;

/* ═══════════ STATE ═══════════ */
var db = null;
var currentView = 'dashboard';
var cart = [];
var payMode = 'Cash';
var selectedCustomer = 'c1';
var doctorName = '';
var counterLevel = 'groups';
var selectedGroup = null;
var posQuery = '';
var loggedIn = false;
var currentUserData = null;
var isWholesaleMode = false;
var presetEditorOpen = false;
var lastBackupReminderShown = 0;
var useLoyaltyPoints = false;

/* ═══════════ HELPERS ═══════════ */
function $(s){ return document.querySelector(s); }
function $$(s){ return Array.prototype.slice.call(document.querySelectorAll(s)); }
function esc(s){
  return String(s==null?'':s).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
function uid(p){ return (p||'id')+'_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function money(n){ return (db.settings.currency||'Rs')+' '+(Number(n)||0).toLocaleString('en-PK',{maximumFractionDigits:2}); }
function todayISO(){ return new Date().toISOString().slice(0,10); }
function fmtDate(d){ return d?new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}):''; }
function fmtDateTime(d){ return d?new Date(d).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):''; }
function daysUntil(s){ if(!s) return 9999; return Math.round((new Date(s)-new Date())/86400000); }
function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
function lsSet(k,v){ try{ localStorage.setItem(k,v); return true; }catch(e){ return false; } }
function lsRemove(k){ try{ localStorage.removeItem(k); }catch(e){} }

/* ═══════════ TOAST ═══════════ */
function toast(msg, kind){
  var root = $('#toast');
  if(!root) return;
  var t = document.createElement('div');
  t.className = 'toast'+(kind?' '+kind:'');
  t.textContent = msg;
  root.appendChild(t);
  var duration = Math.max(2400, Math.min(6000, msg.length * 60));
  setTimeout(function(){
    t.style.opacity='0';
    t.style.transition='.3s';
    setTimeout(function(){ t.remove(); }, 300);
  }, duration);
}

/* ═══════════ MODAL ═══════════ */
function openModal(title, body, foot, opts){
  opts = opts||{};
  var bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML =
    '<div class="modal '+(opts.wide?'wide':'')+'">' +
      '<div class="modal-head"><h3>'+esc(title)+'</h3><button type="button" class="x" data-close>&times;</button></div>' +
      '<div class="modal-body">'+body+'</div>' +
      (foot ? '<div class="modal-foot">'+foot+'</div>' : '') +
    '</div>';
  $('#modal-root').appendChild(bg);
  bg.addEventListener('click', function(e){
    if(e.target === bg || e.target.closest('[data-close]')) bg.remove();
  });
  return bg;
}

function confirmAction(title, message, onConfirm){
  var body = '<div class="alert alert-warn"><b>⚠️ ' + esc(title) + '</b><br>' + esc(message) + '</div>';
  var bg = openModal('⚠️ Confirm', body,
    '<button type="button" class="btn" data-close>Cancel</button>' +
    '<button type="button" class="btn danger" id="confirm-yes">Yes, Proceed</button>');
  setTimeout(function(){
    var btn = document.getElementById('confirm-yes');
    if(btn) btn.addEventListener('click', function(){ bg.remove(); onConfirm(); });
  }, 30);
}

/* ═══════════════════════════════════════════════════════════════
   BARCODE SYSTEM — Code128 Encoder + SVG Generator
   ═══════════════════════════════════════════════════════════════ */
var CODE128_PATTERNS = [
  '11011001100','11001101100','11001100110','10010011000','10010001100','10001001100','10011001000','10011000100','10001100100','11001001000',
  '11001000100','11000100100','10110011100','10011011100','10011001110','10111001100','10011101100','10011100110','11001110010','11001011100',
  '11001001110','11011100100','11001110100','11101101110','11101001100','11100101100','11100100110','11101100100','11100110100','11100110010',
  '11011011000','11011000110','11000110110','10100011000','10001011000','10001000110','10110001000','10001101000','10001100010','11010001000',
  '11000101000','11000100010','10110111000','10110001110','10001101110','10111011000','10111000110','10001110110','11101110110','11010001110',
  '11000101110','11011101000','11011100010','11011101110','11101011000','11101000110','11100010110','11101101000','11101100010','11100011010',
  '11101111010','11001000010','11110001010','10100110000','10100001100','10010110000','10010000110','10000101100','10000100110','10110010000',
  '10110000100','10011010000','10011000010','10000110100','10000110010','11000010010','11001010000','11110111010','11000010100','10001111010',
  '10100111100','10010111100','10010011110','10111100100','10011110100','10011110010','11110100100','11110010100','11110010010','11011011110',
  '11011110110','11110110110','10101111000','10100011110','10001011110','10111101000','10111100010','11110101000','11110100010','10111011110',
  '10111101110','11101011110','11110101110','11010000100','11010010000','11010011100','1100011101011'
];
var CODE128_START_B = 104;
var CODE128_STOP = 106;

function encodeCode128(text){
  text = String(text || '');
  if(!text) text = 'EMPTY';
  var checksum = CODE128_START_B;
  var encoded = CODE128_PATTERNS[CODE128_START_B];
  for(var i = 0; i < text.length; i++){
    var code = text.charCodeAt(i) - 32;
    if(code < 0 || code > 95) code = 0;
    encoded += CODE128_PATTERNS[code];
    checksum += code * (i + 1);
  }
  checksum = checksum % 103;
  encoded += CODE128_PATTERNS[checksum];
  encoded += CODE128_PATTERNS[CODE128_STOP] + '11';
  return encoded;
}

function generateBarcodeSVG(text, options){
  options = options || {};
  var width = options.width || 2;
  var height = options.height || 60;
  var showText = options.showText !== false;
  var fontSize = options.fontSize || 12;
  var pattern;
  try { pattern = encodeCode128(text); }
  catch(e){ return '<div style="color:red;font-size:11px;">Barcode error</div>'; }
  var totalWidth = pattern.length * width;
  var textHeight = showText ? fontSize + 8 : 0;
  var totalHeight = height + textHeight;
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + totalWidth + '" height="' + totalHeight + '" viewBox="0 0 ' + totalWidth + ' ' + totalHeight + '" style="display:block;max-width:100%;height:auto;">';
  svg += '<rect width="' + totalWidth + '" height="' + totalHeight + '" fill="#ffffff"/>';
  var x = 0;
  for(var i = 0; i < pattern.length; i++){
    if(pattern[i] === '1') svg += '<rect x="' + x + '" y="0" width="' + width + '" height="' + height + '" fill="#000000"/>';
    x += width;
  }
  if(showText){
    svg += '<text x="' + (totalWidth / 2) + '" y="' + (height + fontSize) + '" ';
    svg += 'text-anchor="middle" font-family="Courier New,monospace" font-size="' + fontSize + '" fill="#000000">';
    svg += esc(text) + '</text>';
  }
  svg += '</svg>';
  return svg;
}

function generateAutoBarcode(){
  // AS + timestamp based unique barcode
  return 'AS' + Date.now().toString().slice(-10) + Math.floor(Math.random()*90+10);
}

function openBarcodeModal(product){
  if(!product){ toast('Product not found', 'err'); return; }
  var barcode = product.barcode || '';
  if(!barcode){
    barcode = generateAutoBarcode();
    product.barcode = barcode;
    addAuditLog('Barcode Generated', product.name + ' · ' + barcode);
    saveDb();
    toast('Auto-generated: ' + barcode);
  }
  var body =
    '<div class="alert alert-info" style="font-size:12px;"><b>📊 Barcode Label</b> — Print karke product pe paste karein.</div>' +
    '<div class="field"><label>Product</label><input value="' + esc(product.name) + '" readonly/></div>' +
    '<div class="field"><label>Barcode</label>' +
      '<div style="display:flex;gap:8px;">' +
        '<input id="bc-value" value="' + esc(barcode) + '" style="font-family:monospace;flex:1;"/>' +
        '<button type="button" class="btn" id="bc-regen" title="Regenerate">🔄</button>' +
      '</div>' +
      '<div class="muted" style="font-size:11px;margin-top:4px;">Code128 — letters + numbers allowed</div>' +
    '</div>' +
    '<div class="row">' +
      '<div class="field"><label>Bar Width</label><input type="number" id="bc-bar-width" value="2" min="1" max="5" step="0.5"/></div>' +
      '<div class="field"><label>Bar Height (px)</label><input type="number" id="bc-bar-height" value="60" min="30" max="120"/></div>' +
    '</div>' +
    '<div class="row">' +
      '<div class="field"><label>Copies</label><input type="number" id="bc-copies" value="1" min="1" max="200"/></div>' +
      '<div class="field"><label>Show Text</label><select id="bc-show-text"><option value="1">Yes</option><option value="0">No</option></select></div>' +
    '</div>' +
    '<div class="divider"></div>' +
    '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:8px;">Preview</label>' +
    '<div id="bc-preview" style="background:#fff;padding:14px;border-radius:8px;border:1px solid var(--line);text-align:center;overflow-x:auto;">' +
      generateBarcodeSVG(barcode, { width: 2, height: 60, showText: true }) +
    '</div>';
  var bg = openModal('📊 Barcode — ' + product.name, body,
    '<button type="button" class="btn" data-close>Close</button>' +
    '<button type="button" class="btn" id="bc-copy">📋 Copy</button>' +
    '<button type="button" class="btn primary" id="bc-print">🖨 Print Labels</button>',
    { wide: true });
  setTimeout(function(){
    var valueEl = document.getElementById('bc-value');
    var previewEl = document.getElementById('bc-preview');
    var barWidthEl = document.getElementById('bc-bar-width');
    var barHeightEl = document.getElementById('bc-bar-height');
    var showTextEl = document.getElementById('bc-show-text');
    function updatePreview(){
      var val = valueEl.value.trim() || barcode;
      var w = +barWidthEl.value || 2;
      var h = +barHeightEl.value || 60;
      var st = showTextEl.value === '1';
      if(!val){ previewEl.innerHTML = '<div class="muted">Barcode khali</div>'; return; }
      try { previewEl.innerHTML = generateBarcodeSVG(val, { width: w, height: h, showText: st }); }
      catch(e){ previewEl.innerHTML = '<div style="color:red;">' + e.message + '</div>'; }
    }
    valueEl.addEventListener('input', updatePreview);
    barWidthEl.addEventListener('input', updatePreview);
    barHeightEl.addEventListener('input', updatePreview);
    showTextEl.addEventListener('change', updatePreview);
    document.getElementById('bc-regen').onclick = function(){
      valueEl.value = generateAutoBarcode();
      updatePreview();
    };
    document.getElementById('bc-copy').onclick = function(){
      var val = valueEl.value.trim();
      try { navigator.clipboard.writeText(val); toast('✓ Copied: ' + val); }
      catch(e){ valueEl.select(); document.execCommand('copy'); toast('✓ Copied'); }
    };
    document.getElementById('bc-print').onclick = function(){
      var val = valueEl.value.trim();
      if(!val){ toast('Barcode khali hai', 'err'); return; }
      product.barcode = val;
      addAuditLog('Barcode Updated', product.name + ' · ' + val);
      saveDb();
      var copies = +document.getElementById('bc-copies').value || 1;
      printBarcodeLabels(product, val, copies, +barWidthEl.value || 2, +barHeightEl.value || 60, showTextEl.value === '1');
    };
  }, 50);
}

function printBarcodeLabels(product, barcode, copies, barWidth, barHeight, showText){
  var labelsHtml = '';
  for(var i = 0; i < copies; i++){
    labelsHtml += '<div class="bc-label">' +
      '<div class="bc-label-name">' + esc(product.name.length > 30 ? product.name.substring(0, 30) : product.name) + '</div>' +
      (product.packing ? '<div class="bc-label-packing">' + esc(product.packing) + '</div>' : '') +
      '<div class="bc-label-barcode">' + generateBarcodeSVG(barcode, { width: barWidth, height: barHeight, showText: showText }) + '</div>' +
      '<div class="bc-label-price">' + money(product.batches && product.batches[0] ? product.batches[0].mrp : 0) + '</div>' +
    '</div>';
  }
  var html = '<!DOCTYPE html><html><head><title>Barcode Labels</title>' +
    '<style>* { box-sizing: border-box; margin: 0; padding: 0; }' +
    'body { font-family: Arial, sans-serif; padding: 10mm; background: #fff; }' +
    '.bc-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }' +
    '.bc-label { border: 1px dashed #ccc; padding: 3mm 2mm; text-align: center; page-break-inside: avoid; height: 32mm; display: flex; flex-direction: column; justify-content: space-between; align-items: center; }' +
    '.bc-label-name { font-size: 9px; font-weight: 700; line-height: 1.2; margin-bottom: 1mm; }' +
    '.bc-label-packing { font-size: 7px; color: #666; margin-bottom: 1mm; }' +
    '.bc-label-barcode { flex: 1; display: flex; align-items: center; justify-content: center; }' +
    '.bc-label-price { font-size: 10px; font-weight: 800; margin-top: 1mm; }' +
    '.bc-toolbar { position: fixed; top: 10px; right: 10px; display: flex; gap: 8px; z-index: 100; }' +
    '.bc-toolbar button { padding: 10px 18px; border: none; border-radius: 8px; font-weight: 700; font-size: 13px; cursor: pointer; }' +
    '.bc-btn-print { background: #047857; color: #fff; } .bc-btn-close { background: #dc2626; color: #fff; }' +
    '@media print { .bc-toolbar { display: none !important; } body { padding: 5mm; } @page { margin: 5mm; } }' +
    '</style></head><body>' +
    '<div class="bc-toolbar">' +
      '<button class="bc-btn-print" onclick="window.print()">🖨 Print</button>' +
      '<button class="bc-btn-close" onclick="window.close()">✕ Close</button>' +
    '</div><div class="bc-grid">' + labelsHtml + '</div></body></html>';
  var w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  addAuditLog('Barcode Printed', product.name + ' · ' + copies + ' copies');
  saveDb();
}

function printBulkBarcodes(){
  var products = db.products.filter(function(p){ return p.barcode; });
  if(!products.length){ toast('Koi product mein barcode nahi', 'warn'); return; }
  if(!confirm('Bulk Barcode Print — ' + products.length + ' products. Continue?')) return;
  var html = '';
  products.forEach(function(p){
    html += '<div style="display:inline-block;width:32%;padding:8px;text-align:center;vertical-align:top;page-break-inside:avoid;border:1px dashed #ddd;margin:2px;">' +
      '<div style="font-size:10px;font-weight:700;line-height:1.2;margin-bottom:4px;height:24px;overflow:hidden;">' + esc(p.name) + '</div>' +
      (p.packing ? '<div style="font-size:8px;color:#666;margin-bottom:3px;">' + esc(p.packing) + '</div>' : '') +
      generateBarcodeSVG(p.barcode, { width: 1.5, height: 45, showText: true, fontSize: 10 }) +
      '<div style="font-size:11px;font-weight:800;margin-top:3px;">' + money(p.batches && p.batches[0] ? p.batches[0].mrp : 0) + '</div></div>';
  });
  var w = window.open('', '_blank');
  w.document.write('<!DOCTYPE html><html><head><title>Bulk Barcodes</title><style>body{margin:0;padding:8mm;font-family:Arial;}' +
    '.toolbar{position:fixed;top:10px;right:10px;display:flex;gap:8px;z-index:100;}' +
    '.toolbar button{padding:10px 18px;border:none;border-radius:8px;font-weight:700;cursor:pointer;}' +
    '.btn-print{background:#047857;color:#fff;}.btn-close{background:#dc2626;color:#fff;}' +
    '@media print{.toolbar{display:none;}body{padding:5mm;}}' +
    '</style></head><body><div class="toolbar"><button class="btn-print" onclick="window.print()">🖨 Print All</button>' +
    '<button class="btn-close" onclick="window.close()">✕ Close</button></div>' + html + '</body></html>');
  w.document.close();
  addAuditLog('Bulk Barcode Print', products.length + ' products');
  saveDb();
}

/* ═══════════ SESSION ═══════════ */
function saveSession(user){
  try{
    var days = (db && db.settings && db.settings.sessionDays) || 30;
    var session = {
      user: user, loginAt: Date.now(),
      expiresAt: Date.now() + days * 24 * 60 * 60 * 1000,
      version: 400
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return true;
  }catch(e){ return false; }
}

function loadSession(){
  try{
    var raw = localStorage.getItem(SESSION_KEY);
    if(!raw) return null;
    var session = JSON.parse(raw);
    if(!session || !session.user) return null;
    if(session.expiresAt && Date.now() > session.expiresAt){
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  }catch(e){ return null; }
}

function clearSession(){
  try{ localStorage.removeItem(SESSION_KEY); }catch(e){}
}

/* ═══════════ CLOUD SYNC ═══════════ */
var cloudSyncEnabled = true;
var cloudStatus = 'initializing';
var lastCloudSyncAt = null;
var cloudSyncTimer = null;
var cloudSaveFailedCount = 0;

function updateCloudBadge(){
  var badge = document.getElementById('cloud-status');
  var loginBadge = document.getElementById('cloud-status-login');
  var text = '', color = '';
  if(!window.FirebaseReady){ text = '⚪ Loading...'; color = 'var(--muted)'; }
  else if(cloudStatus === 'ok'){ text = '☁ Synced ' + (lastCloudSyncAt||''); color = 'var(--ok)'; }
  else if(cloudStatus === 'syncing'){ text = '🔄 Syncing...'; color = 'var(--info)'; }
  else if(cloudStatus === 'offline'){ text = '⚡ Offline'; color = 'var(--warn)'; }
  else if(cloudStatus === 'error'){ text = '⚠ Error'; color = 'var(--danger)'; }
  else { text = '☁ Ready'; color = 'var(--muted)'; }
  if(badge){ badge.textContent = text; badge.style.color = color; badge.style.borderColor = color; }
  if(loginBadge){ loginBadge.textContent = text; loginBadge.style.color = color; }
}

function syncToCloud(jsonData){
  if(!cloudSyncEnabled) return;
  if(!window.FirebaseReady || !navigator.onLine){ cloudStatus = 'offline'; updateCloudBadge(); return; }
  clearTimeout(cloudSyncTimer);
  cloudStatus = 'syncing';
  updateCloudBadge();
  cloudSyncTimer = setTimeout(async function(){
    try{
      var fs = window.FirebaseDB;
      var f = window.FirebaseFuncs;
      var docRef = f.doc(fs, 'pharmacy', 'main');
      var parsed = {};
      try { parsed = JSON.parse(jsonData); } catch(e){}
      await f.setDoc(docRef, {
        data: jsonData, updatedAt: new Date().toISOString(),
        storeName: (parsed.settings && parsed.settings.storeName) || 'Unknown',
        appVersion: 'v4.0'
      });
      cloudStatus = 'ok';
      lastCloudSyncAt = new Date().toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'});
      cloudSaveFailedCount = 0;
      updateCloudBadge();
    }catch(e){
      cloudSaveFailedCount++;
      cloudStatus = (cloudSaveFailedCount >= 3) ? 'error' : 'offline';
      updateCloudBadge();
    }
  }, 3000);
}

async function fetchFromCloud(){
  if(!window.FirebaseReady) return null;
  try{
    var docRef = window.FirebaseFuncs.doc(window.FirebaseDB, 'pharmacy', 'main');
    var snap = await window.FirebaseFuncs.getDoc(docRef);
    if(snap.exists()){ var d = snap.data(); return { data: d.data, updatedAt: d.updatedAt, storeName: d.storeName }; }
    return null;
  }catch(e){ return null; }
}

async function forceCloudSync(){
  if(!window.FirebaseReady){ toast('Firebase load nahi hua', 'err'); return; }
  toast('🔄 Cloud sync...');
  syncToCloud(JSON.stringify(db));
}

async function forceCloudRestore(){
  if(!window.FirebaseReady){ toast('Firebase load nahi hua', 'err'); return; }
  if(!confirm('Cloud se data load karein?')) return;
  var res = await fetchFromCloud();
  if(!res){ toast('Cloud mein data nahi mila', 'warn'); return; }
  if(!confirm('Store: ' + res.storeName + '\nUpdated: ' + new Date(res.updatedAt).toLocaleString('en-GB') + '\n\nRestore?')) return;
  lsSet(LS_KEY, res.data);
  location.reload();
}

window.addEventListener('online', function(){
  cloudStatus = 'syncing'; updateCloudBadge();
  if(db) syncToCloud(JSON.stringify(db));
});
window.addEventListener('offline', function(){
  cloudStatus = 'offline'; updateCloudBadge();
});

/* ═══════════ GROUPS / CATEGORIES ═══════════ */
var BASE_GROUPS = [
  { key:'Painkiller', color:'#fee2e2', text:'#dc2626', short:'PK', label:'Painkiller / Fever' },
  { key:'Antibiotic', color:'#dcfce7', text:'#16a34a', short:'AB', label:'Antibiotic' },
  { key:'Gastric', color:'#fef3c7', text:'#d97706', short:'GS', label:'Gastric / Stomach' },
  { key:'Cough/Cold', color:'#dbeafe', text:'#2563eb', short:'CC', label:'Cough / Cold' },
  { key:'Blood Pressure', color:'#fce7f3', text:'#db2777', short:'BP', label:'Blood Pressure' },
  { key:'Diabetes', color:'#ede9fe', text:'#7c3aed', short:'DB', label:'Diabetes' },
  { key:'First Aid', color:'#ffedd5', text:'#ea580c', short:'FA', label:'First Aid' },
  { key:'Supplement', color:'#cffafe', text:'#0891b2', short:'SP', label:'Supplement' },
  { key:'Other', color:'#f1f5f9', text:'#64748b', short:'OT', label:'Other' }
];
var CUSTOM_COLORS = [
  { color:'#ffe4e6', text:'#be123c' }, { color:'#e0e7ff', text:'#4338ca' },
  { color:'#d1fae5', text:'#047857' }, { color:'#fef9c3', text:'#a16207' },
  { color:'#cffafe', text:'#0e7490' }, { color:'#fae8ff', text:'#a21caf' },
  { color:'#ffedd5', text:'#c2410c' }, { color:'#ecfccb', text:'#4d7c0f' }
];
function getAllGroups(){
  var custom = (db && db.settings && Array.isArray(db.settings.customGroups)) ? db.settings.customGroups : [];
  return BASE_GROUPS.concat(custom);
}
function getGroupInfo(key){
  var groups = getAllGroups();
  return groups.find(function(g){ return g.key === key; }) || groups[groups.length-1];
}
function makeCustomGroup(name){
  var groups = getAllGroups();
  var exists = groups.find(function(g){ return g.key.toLowerCase() === name.toLowerCase(); });
  if(exists) return exists;
  var idx = (db.settings.customGroups || []).length % CUSTOM_COLORS.length;
  var col = CUSTOM_COLORS[idx];
  var grp = { key: name, color: col.color, text: col.text, short: name.substring(0,2).toUpperCase(), label: name, custom: true };
  if(!db.settings.customGroups) db.settings.customGroups = [];
  db.settings.customGroups.push(grp);
  saveDb();
  return grp;
}

/* ═══════════ SEED DATA ═══════════ */
function getSeedProducts(){
  function p(name,company,generic,packing,cat,group,bc,batch,exp,packs,mrp,cost,packSize,unitLabel,loosePrice,wholesalePrice){
    return {
      id:'p_'+bc, name:name, company:company, generic:generic, packing:packing,
      category:cat, group:group, minStock:10, barcode:bc,
      packSize: packSize, unitLabel: unitLabel,
      batches:[{ id:'b_'+bc+'_0', batch:batch, expiry:exp, qty:packs*packSize,
        mrp:mrp, cost:cost, loosePrice:loosePrice, wholesalePrice:wholesalePrice||Math.round(mrp*0.85) }]
    };
  }
  return [
    p('Panadol 500mg','GSK','Paracetamol','Strip of 10','Tablet','Painkiller','8901234500001','PND-A1','2027-08-31',20,25,18,10,'Tab',3,22),
    p('Panadol Extra','GSK','Paracetamol+Caffeine','Strip of 10','Tablet','Painkiller','8901234500002','PND-EX1','2027-06-30',15,35,26,10,'Tab',4,30),
    p('Brufen 400mg','Abbott','Ibuprofen','Strip of 10','Tablet','Painkiller','8901234500003','BRF-400','2027-02-28',12,90,62,10,'Tab',10,78),
    p('Disprin','Reckitt','Aspirin','Strip of 10','Tablet','Painkiller','8901234500005','DSP-01','2027-12-31',15,35,25,10,'Tab',4,30),
    p('Calpol Syrup 120ml','GSK','Paracetamol','Bottle','Syrup','Painkiller','8901234500006','CLP-120','2027-05-31',10,130,92,1,'Bottle',0,112),
    p('Augmentin 625mg','GSK','Amoxicillin+Clav','Strip of 6','Tablet','Antibiotic','8901234500010','AUG-625','2026-12-31',15,480,380,6,'Tab',90,420),
    p('Amoxil 500mg','GSK','Amoxicillin','Strip of 10','Capsule','Antibiotic','8901234500013','AMX-500','2027-06-30',15,190,145,10,'Cap',22,165),
    p('Cipro 500mg','Bayer','Ciprofloxacin','Strip of 10','Tablet','Antibiotic','8901234500014','CPR-500','2027-09-30',10,280,215,10,'Tab',30,245),
    p('Azomax 500mg','Hilton','Azithromycin','Strip of 3','Tablet','Antibiotic','8901234500015','AZM-500','2027-04-30',12,320,245,3,'Tab',110,280),
    p('Gaviscon 120ml','Reckitt','Sodium Alginate','Bottle','Syrup','Gastric','8901234500020','GVS-120','2027-11-30',8,280,210,1,'Bottle',0,245),
    p('Risek 20mg','Getz','Omeprazole','Strip of 14','Capsule','Gastric','8901234500021','RSK-20','2027-08-31',15,280,210,14,'Cap',22,245),
    p('Flagyl 400mg','Sanofi','Metronidazole','Strip of 10','Tablet','Gastric','8901234500025','FLG-400','2027-10-31',12,110,82,10,'Tab',12,95),
    p('Arinac Forte','Abbott','Ibuprofen+Pseudo','Strip of 10','Tablet','Cough/Cold','8901234500030','ARN-F','2027-03-31',12,110,82,10,'Tab',12,95),
    p('Actifed','GSK','Triprolidine','Strip of 10','Tablet','Cough/Cold','8901234500031','ACF-01','2027-09-30',10,120,92,10,'Tab',14,105),
    p('Hydryllin Syrup','Searle','Diphenhydramine','Bottle','Syrup','Cough/Cold','8901234500033','HYD-S','2027-01-31',6,140,105,1,'Bottle',0,122),
    p('Dettol 100ml','Reckitt','Antiseptic','Bottle','Other','First Aid','8901234500040','DTT-100','2028-12-31',10,180,135,1,'Bottle',0,155),
    p('Betadine 30ml','Win-Medicare','Povidone Iodine','Bottle','Other','First Aid','8901234500041','BTD-30','2028-06-30',8,130,95,1,'Bottle',0,112),
    p('Concor 5mg','Merck','Bisoprolol','Strip of 14','Tablet','Blood Pressure','8901234500050','CNC-5','2027-09-30',12,280,215,14,'Tab',22,245),
    p('Norvasc 5mg','Pfizer','Amlodipine','Strip of 14','Tablet','Blood Pressure','8901234500051','NVC-5','2027-08-31',12,220,165,14,'Tab',18,192),
    p('Glucophage 500mg','Merck','Metformin','Strip of 30','Tablet','Diabetes','8901234500060','GLP-500','2027-10-31',15,320,240,30,'Tab',12,280),
    p('Amaryl 2mg','Sanofi','Glimepiride','Strip of 15','Tablet','Diabetes','8901234500061','AMR-2','2027-07-31',10,320,245,15,'Tab',24,280),
    p('Vitamin D3','Nutrifactor','Cholecalciferol','Strip of 30','Capsule','Supplement','8901234500070','VD3-2K','2027-11-30',8,550,410,30,'Cap',20,480)
  ];
}

function getDefaultSettings(){
  return {
    storeName:'Al-Shifa Pharmacy', storeSub:'Your Health, Our Commitment.',
    address:'Karachi', phone:'+92-318-2777-875',
    ntn:'', gstNo:'', licenseNo:'',
    currency:'Rs', lowStock:10, expiryDays:90,
    footer:'Get well soon!',
    invoicePrefix:'INV-', slipPrefix:'SLP-', wsPrefix:'WS-', poPrefix:'PO-',
    nextInvoice:1, nextSlip:1, nextWholesale:1, nextPO:1,
    taxEnabled:false, taxRate:0, taxLabel:'GST',
    logo:'', logoSize:80, logoPosition:'left',
    printLogo:true, printLogoSize:80, printLogoPosition:'center',
    receiptType:'80mm',
    invoiceTerms:'Goods once sold will not be taken back.',
    invoiceBank:'Bank: Meezan Bank\nAccount: 0123456789',
    presets:{
      'Fever Pack':['Panadol 500mg','Calpol Syrup 120ml','Brufen 400mg'],
      'Cold Pack':['Arinac Forte','Actifed'],
      'Gastric Pack':['Risek 20mg','Gaviscon 120ml']
    },
    customGroups: [],
    sessionDays: 30,
    autoSendCreditBill: true
  };
}

function getSeedData(){
  return {
    settings: getDefaultSettings(),
    products: getSeedProducts(),
    customers: [{ id:'c1', name:'Walk-in Customer', phone:'', address:'', ledger:[], points:0, type:'retail' }],
    suppliers: [
      { id:'s1', name:'GSK Distributor', phone:'051-1112223', address:'I-9', email:'', companies:['GSK'], ledger:[] },
      { id:'s2', name:'Abbott Pharma', phone:'051-3334445', address:'Blue Area', email:'', companies:['Abbott'], ledger:[] }
    ],
    sales: [], purchases: [], purchaseOrders: [], customerOrders: [], returns: [], held: [], dayCloses: [], staff: [],
    auditLog: [], notifications: []
  };
}

/* ═══════════ PACK HELPERS ═══════════ */
function guessPackSize(p){
  if(p.packSize) return p.packSize;
  var s = String(p.packing||'').toLowerCase();
  var m = s.match(/(\d+)\s*x\s*(\d+)/);
  if(m) return parseInt(m[1]) * parseInt(m[2]);
  if(/strip\s*of\s*(\d+)/i.test(s)){ var mm = s.match(/strip\s*of\s*(\d+)/i); return parseInt(mm[1]); }
  return 1;
}
function guessUnitLabel(p){
  if(p.unitLabel) return p.unitLabel;
  if(p.category === 'Capsule') return 'Cap';
  if(p.category === 'Tablet') return 'Tab';
  if(p.category === 'Syrup') return 'Bottle';
  if(p.category === 'Injection') return 'Inj';
  return 'pc';
}

/* ═══════════ LOAD DB ═══════════ */
function loadDb(){
  try{
    var raw = lsGet(LS_KEY) || lsGet(LEGACY_LS_KEY);
    if(raw) lsSet(LS_KEY, raw);
    if(raw){
      var d = JSON.parse(raw);
      if(d && d.settings && d.products){
        d.settings = Object.assign(getDefaultSettings(), d.settings);
        ['sales','purchases','purchaseOrders','customerOrders','returns','held','dayCloses','customers','suppliers','products','staff','auditLog','notifications'].forEach(function(k){
          if(!Array.isArray(d[k])) d[k] = [];
        });
        if(!Array.isArray(d.settings.customGroups)) d.settings.customGroups = [];
        if(!d.customers.find(function(c){ return c.id === 'c1'; })){
          d.customers.unshift({ id:'c1', name:'Walk-in Customer', phone:'', address:'', ledger:[], points:0, type:'retail' });
        }
        d.customers.forEach(function(c){ if(!c.type) c.type = 'retail'; });
        d.products.forEach(function(p){
          p.packSize = guessPackSize(p);
          p.unitLabel = guessUnitLabel(p);
          if(!Array.isArray(p.batches)) p.batches = [];
          if(!p.barcode) p.barcode = generateAutoBarcode();
          p.batches.forEach(function(b){
            if(b.loosePrice == null) b.loosePrice = p.packSize > 1 ? Math.ceil(b.mrp / p.packSize * 1.2) : 0;
            if(b.wholesalePrice == null) b.wholesalePrice = Math.round(b.mrp * 0.85);
          });
        });
        d.suppliers.forEach(function(s){
          if(!Array.isArray(s.companies)) s.companies = [];
          if(!s.email) s.email = '';
        });
        return d;
      }
    }
  }catch(e){ console.error('loadDb:', e); }
  return getSeedData();
}

function saveDb(){
  try{
    var json = JSON.stringify(db);
    var ok = lsSet(LS_KEY, json);
    if(!ok){ toast('⚠ Storage full!', 'err'); return false; }
    syncToCloud(json);
    return true;
  }catch(e){ toast('⚠ Save error: ' + e.message, 'err'); return false; }
}

/* ═══════════ AUDIT ═══════════ */
function addAuditLog(action, detail){
  if(!db.auditLog) db.auditLog = [];
  db.auditLog.push({ at: new Date().toISOString(), user: currentUserData ? (currentUserData.name || currentUserData.u) : 'system', action: action, detail: detail });
  if(db.auditLog.length > 1000) db.auditLog = db.auditLog.slice(-1000);
}

/* ═══════════ NOTIFICATIONS ═══════════ */
function addNotification(title, message, type){
  if(!db.notifications) db.notifications = [];
  db.notifications.unshift({ id: uid('n'), at: new Date().toISOString(), title: title, message: message, type: type || 'info', read: false });
  if(db.notifications.length > 100) db.notifications = db.notifications.slice(0, 100);
  saveDb();
  updateNotifBadge();
}
function updateNotifBadge(){
  var badge = document.getElementById('notif-badge');
  if(!badge) return;
  var unread = (db.notifications || []).filter(function(n){ return !n.read; }).length;
  if(unread > 0){ badge.textContent = unread > 99 ? '99+' : unread; badge.style.display = 'flex'; }
  else { badge.style.display = 'none'; }
}

/* ═══════════ FINDERS ═══════════ */
function findProduct(id){ return db.products.find(function(p){ return p.id === id; }); }
function findCustomer(id){ return db.customers.find(function(c){ return c.id === id; }); }
function findSupplier(id){ return db.suppliers.find(function(s){ return s.id === id; }); }
function totalStock(p){ return (p.batches||[]).reduce(function(s,b){ return s+(+b.qty||0); }, 0); }
function nearestExpiry(p){
  var b = (p.batches||[]).filter(function(x){ return x.qty>0; }).sort(function(a,z){ return new Date(a.expiry)-new Date(z.expiry); })[0];
  return b ? b.expiry : '';
}
function ledgerBalance(l){
  return (l||[]).reduce(function(s,e){
    return s + ((e.type==='sale'||e.type==='credit'||e.type==='purchase') ? +e.amount : -e.amount);
  }, 0);
}
function stockDisplay(p){
  var total = totalStock(p);
  var ps = p.packSize || 1;
  if(ps <= 1) return total + ' ' + (p.unitLabel||'pc');
  var packs = Math.floor(total / ps);
  var loose = total % ps;
  if(loose === 0) return packs + ' pack' + (packs !== 1 ? 's' : '') + ' (' + total + ' ' + (p.unitLabel||'Tab') + ')';
  return packs + ' pack + ' + loose + ' ' + (p.unitLabel||'Tab');
}
function cartUnitsInBatch(batchId, excludeIdx){
  return cart.reduce(function(s, c, i){
    if(i === excludeIdx) return s;
    if(c.batchId !== batchId) return s;
    var p = findProduct(c.productId);
    if(!p) return s;
    return s + (c.mode === 'pack' ? c.qty * p.packSize : c.qty);
  }, 0);
}

/* ═══════════ CREDIT LIMIT + LOYALTY ═══════════ */
function checkCreditLimit(cust, newAmount){
  if(!cust || cust.type !== 'wholesale') return { ok:true };
  var limit = +cust.creditLimit || 0;
  if(limit <= 0) return { ok:true };
  var currentBalance = ledgerBalance(cust.ledger);
  var newBalance = currentBalance + newAmount;
  if(newBalance > limit){
    return { ok:false, msg: 'Credit limit exceed!\nLimit: ' + money(limit) + '\nCurrent: ' + money(currentBalance) + '\nNew: ' + money(newBalance) };
  }
  return { ok:true };
}
function earnPoints(cust, amount){
  if(!cust || cust.id === 'c1') return 0;
  var points = Math.floor(amount / POINTS_EARN_RATE);
  if(points > 0) cust.points = (cust.points || 0) + points;
  return points;
}
function redeemPoints(cust, pointsToRedeem){
  if(!cust) return 0;
  var available = cust.points || 0;
  var redeem = Math.min(pointsToRedeem, available);
  if(redeem <= 0) return 0;
  cust.points = available - redeem;
  return redeem * POINTS_VALUE;
}

/* ═══════════════════════════════════════════════════════════════
   CREDIT BILL WHATSAPP — Current Bill + Previous Balance
   ═══════════════════════════════════════════════════════════════ */
function sendCreditBillWhatsApp(customer, currentSale){
  if(!customer){ toast('Customer not found', 'err'); return; }
  if(!customer.phone){ 
    toast('Customer ka phone number nahi hai', 'warn'); 
    return; 
  }
  
  var s = db.settings;
  var phone = String(customer.phone).replace(/\D/g,'');
  if(phone.length === 10) phone = '92' + phone;
  if(phone.length === 11 && phone.startsWith('0')) phone = '92' + phone.substring(1);
  
  // ═══ Calculate balances ═══
  // Previous balance = all ledger entries BEFORE this sale
  var ledger = (customer.ledger || []).slice();
  // Remove this sale entry from calculation
  var prevLedger = ledger.filter(function(l){ 
    if(!currentSale) return true;
    return !(l.type === 'sale' && l.note === currentSale.invoiceNo);
  });
  var previousBalance = ledgerBalance(prevLedger);
  
  // Current bill total
  var currentBill = currentSale ? currentSale.total : 0;
  
  // New total outstanding
  var newBalance = previousBalance + currentBill;
  
  // ═══ Build message ═══
  var msg = '';
  msg += '*🏪 ' + s.storeName + '*\n';
  msg += '━━━━━━━━━━━━━━━━━━━\n\n';
  msg += 'Assalam-o-Alaikum *' + customer.name + '*\n\n';
  msg += 'Aap ke khate (account) ki tafseel:\n\n';
  
  // Current Bill Section
  if(currentSale){
    msg += '*🧾 AAJ KA BILL*\n';
    msg += '━━━━━━━━━━━━━━━━━━━\n';
    msg += 'Bill #: ' + currentSale.invoiceNo + '\n';
    msg += 'Date: ' + fmtDateTime(currentSale.date) + '\n\n';
    msg += '*Items:*\n';
    (currentSale.items || []).forEach(function(it, i){
      msg += (i+1) + '. ' + it.name + '\n';
      msg += '   ' + it.qty + ' × ' + money(it.unitPrice) + ' = ' + money(it.total) + '\n';
    });
    msg += '\n';
    msg += 'Subtotal: ' + money(currentSale.subtotal || currentSale.total) + '\n';
    if(currentSale.discount) msg += 'Discount: − ' + money(currentSale.discount) + '\n';
    if(currentSale.taxAmount) msg += (currentSale.taxLabel || 'Tax') + ': + ' + money(currentSale.taxAmount) + '\n';
    msg += '*AAJ KA TOTAL: ' + money(currentSale.total) + '*\n\n';
  }
  
  // Previous Balance Section
  msg += '━━━━━━━━━━━━━━━━━━━\n';
  msg += '*📊 KHATE KI HALAT*\n';
  msg += '━━━━━━━━━━━━━━━━━━━\n';
  if(previousBalance > 0){
    msg += '🔴 *Purana Udhaar: ' + money(previousBalance) + '*\n';
  } else if(previousBalance < 0){
    msg += '🟢 *Purani Advance: ' + money(Math.abs(previousBalance)) + '*\n';
  } else {
    msg += '✅ *Purana Balance: ' + money(0) + '*\n';
  }
  if(currentBill > 0) msg += '➕ Aaj ka Bill: ' + money(currentBill) + '\n';
  msg += '━━━━━━━━━━━━━━━━━━━\n';
  msg += '*💰 TOTAL OUTSTANDING: ' + money(newBalance) + '*\n';
  msg += '━━━━━━━━━━━━━━━━━━━\n\n';
  
  // Recent Ledger History (last 5 entries)
  var recentLedger = ledger.slice(-8).reverse();
  if(recentLedger.length > 1){
    msg += '*📋 Recent Transactions:*\n';
    recentLedger.forEach(function(entry){
      if(entry.type === 'sale' || entry.type === 'credit' || entry.type === 'purchase'){
        msg += '🔴 ' + fmtDate(entry.date) + ' — ' + (entry.note || 'Sale') + ' — ' + money(entry.amount) + '\n';
      } else if(entry.type === 'payment'){
        msg += '🟢 ' + fmtDate(entry.date) + ' — Payment — ' + money(entry.amount) + '\n';
      }
    });
    msg += '\n';
  }
  
  msg += '━━━━━━━━━━━━━━━━━━━\n';
  msg += '📍 ' + (s.address || '') + '\n';
  msg += '📞 ' + (s.phone || '') + '\n\n';
  msg += '_Shukriya!_\n';
  msg += '*— ' + s.storeName + '*';
  
  window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(msg), '_blank');
  toast('✓ Credit bill WhatsApp pe bheja: ' + customer.name);
  addAuditLog('Credit Bill Sent', customer.name + ' · ' + (currentSale ? currentSale.invoiceNo : '') + ' · ' + money(newBalance));
  saveDb();
}

/* ═══════════ THEME ═══════════ */
function initThemeToggle(){
  var saved = lsGet('alshifa_theme') || 'light';
  if(saved === 'dark') document.body.classList.add('dark');
  function toggle(){
    if(document.body.classList.contains('dark')){ document.body.classList.remove('dark'); lsSet('alshifa_theme','light'); }
    else { document.body.classList.add('dark'); lsSet('alshifa_theme','dark'); }
  }
  var b1 = document.getElementById('theme-toggle');
  var b2 = document.getElementById('theme-toggle-login');
  if(b1) b1.addEventListener('click', toggle);
  if(b2) b2.addEventListener('click', toggle);
}

/* ═══════════ KEYBOARD SHORTCUTS ═══════════ */
function initKeyboardShortcuts(){
  document.addEventListener('keydown', function(e){
    var tag = (e.target.tagName || '').toLowerCase();
    if(tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if(!loggedIn) return;
    function go(viewKey){
      e.preventDefault();
      if(hasAccess(viewKey)) navigateTo(viewKey);
      else toast('Access denied', 'err');
    }
    if(e.key === 'F1') go('dashboard');
    if(e.key === 'F2'){ e.preventDefault(); if(hasAccess('counter')){ navigateTo('counter'); setTimeout(function(){ var s=$('#pos-search'); if(s) s.focus(); },150); } }
    if(e.key === 'F3') go('inventory');
    if(e.key === 'F4') go('customers');
    if(e.key === 'F5') go('reports');
    if(e.key === 'F6') go('expiry');
    if(e.key === 'F7') go('sales');
    if(e.key === 'F8'){ e.preventDefault(); if((currentView === 'counter' || currentView === 'wholesale') && hasAccess(currentView)){ var ck = $('#pos-checkout'); if(ck) ck.click(); } }
    if(e.key === 'F9'){ e.preventDefault(); if((currentView === 'counter' || currentView === 'wholesale') && hasAccess(currentView)){ var hd = $('#pos-hold'); if(hd) hd.click(); } }
    if(e.key === 'F10') go('settings');
    if(e.key === 'Escape'){ var m = document.querySelector('.modal-bg'); if(m) m.remove(); }
  });
}

/* ═══════════ PERMISSION ═══════════ */
function hasAccess(viewKey){
  if(!currentUserData) return false;
  if(currentUserData.role === 'owner') return true;
  var modules = currentUserData.modules || [];
  return modules.indexOf(viewKey) >= 0;
}

/* ═══════════ FIREBASE AUTH LOGIN ═══════════ */
function initLoginFirebase(){
  var btn = $('#login-btn');
  if(!btn) return;
  var newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);
  btn = newBtn;

  var toggleBtn = $('#toggle-pass');
  var passField = $('#login-pass');
  if(toggleBtn && passField){
    toggleBtn.addEventListener('click', function(ev){
      ev.preventDefault();
      if(passField.type === 'password'){
        passField.type = 'text';
        var s = $('#eye-show'); if(s) s.style.display = 'none';
        var h = $('#eye-hide'); if(h) h.style.display = 'block';
      } else {
        passField.type = 'password';
        var s2 = $('#eye-show'); if(s2) s2.style.display = 'block';
        var h2 = $('#eye-hide'); if(h2) h2.style.display = 'none';
      }
    });
  }

  btn.addEventListener('click', async function(){
    var userEl = $('#login-user');
    var passEl = $('#login-pass');
    var errEl = $('#login-err');
    var email = userEl.value.trim().toLowerCase();
    var password = passEl.value;
    errEl.textContent = '';
    if(!email){ errEl.textContent = 'Email likhein'; userEl.focus(); return; }
    if(!email.includes('@')){ errEl.textContent = 'Sahi email address likhein'; userEl.focus(); return; }
    if(!password){ errEl.textContent = 'Password likhein'; passEl.focus(); return; }

    btn.disabled = true;
    var originalText = btn.textContent;
    btn.textContent = '⏳ Checking...';

    try {
      await window.FirebaseFuncs.signInWithEmailAndPassword(window.FirebaseAuth, email, password);
      btn.disabled = false;
      btn.textContent = originalText;
      passEl.value = '';
      errEl.textContent = '';
    } catch(err){
      btn.disabled = false;
      btn.textContent = originalText;
      passEl.value = '';
      var msg = 'Login failed';
      switch(err.code){
        case 'auth/invalid-email': msg = 'Email galat hai'; break;
        case 'auth/user-not-found': msg = 'Is email ka account nahi hai'; break;
        case 'auth/wrong-password':
        case 'auth/invalid-credential': msg = 'Password galat hai'; break;
        case 'auth/too-many-requests': msg = 'Bohot koshishen — thodi der baad'; break;
        case 'auth/network-request-failed': msg = 'Internet check karein'; break;
        default: msg = 'Error: ' + (err.message || err.code);
      }
      errEl.textContent = msg;
      passEl.focus();
    }
  });

  var userField = $('#login-user');
  var passField2 = $('#login-pass');
  if(userField && !userField.dataset.bound){
    userField.dataset.bound = '1';
    userField.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){ e.preventDefault(); passField2.focus(); }
    });
  }
  if(passField2 && !passField2.dataset.bound2){
    passField2.dataset.bound2 = '1';
    passField2.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){ e.preventDefault(); btn.click(); }
    });
  }
}

function setupForgotPasswordButton(){
  var btn = document.getElementById('forgot-btn');
  if(!btn) return;
  var newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);
  btn = newBtn;
  btn.addEventListener('click', function(){
    var body = '<div class="alert alert-info">Reset link email pe bheja jayega.</div>' +
      '<div class="field"><label>Email Address</label><input id="fp-email" type="email" placeholder="admin@alshifa.com" autofocus/></div>' +
      '<div id="fp-err" style="color:var(--danger);font-size:12px;min-height:16px;"></div>';
    var bg = openModal('Reset Password', body,
      '<button type="button" class="btn" data-close>Cancel</button>' +
      '<button type="button" class="btn primary" id="fp-send">📧 Send Reset Link</button>');
    setTimeout(function(){
      var emailEl = document.getElementById('fp-email');
      var sendBtn = document.getElementById('fp-send');
      var errEl = document.getElementById('fp-err');
      if(emailEl) emailEl.focus();
      if(sendBtn){
        sendBtn.addEventListener('click', async function(){
          var email = emailEl.value.trim().toLowerCase();
          if(!email || !email.includes('@')){ errEl.textContent = 'Sahi email likhein'; return; }
          sendBtn.disabled = true;
          sendBtn.textContent = '⏳ Sending...';
          try {
            await window.FirebaseFuncs.sendPasswordResetEmail(window.FirebaseAuth, email);
            bg.remove();
            toast('✓ Reset link bhej diya');
          } catch(e){
            errEl.textContent = 'Email fail: ' + (e.message || e.code);
            sendBtn.disabled = false;
            sendBtn.textContent = '📧 Send Reset Link';
          }
        });
      }
    }, 50);
  });
}

function performCleanLocalLogout(){
  clearSession();
  loggedIn = false;
  currentUserData = null;
  cart = [];
  isWholesaleMode = false;
  lastBackupReminderShown = 0;
  document.body.style.overflow = '';
}

async function doLogout(){
  if(!confirm('Logout karna chahte hain?')) return;
  addAuditLog('Logout', 'User logged out');
  saveDb();
  try {
    if(window.FirebaseReady && window.FirebaseAuth){
      await window.FirebaseFuncs.signOut(window.FirebaseAuth);
    }
  } catch(e){}
  performCleanLocalLogout();
  showLoginScreen();
  toast('✓ Logout ho gaya');
}

/* ═══════════ SHOW SCREENS ═══════════ */
function showLoginScreen(){
  $('#login-screen').style.display = 'flex';
  $('#app').style.display = 'none';
  setTimeout(function(){ var el = $('#login-user'); if(el) el.focus(); }, 100);
}

function showAppScreen(){
  $('#login-screen').style.display = 'none';
  $('#app').style.display = 'flex';
  var u = currentUserData || { name:'admin', role:'owner' };
  $('#user-name').textContent = u.name;
  $('#user-role').textContent = u.role === 'staff' ? 'Staff' : 'Owner';
  $('#brand-name').textContent = db.settings.storeName;
  $('#brand-sub').textContent = db.settings.storeSub;
  $('#top-store').textContent = db.settings.storeName;

  var logoData = db.settings.logo || '';
  var loginLogo = document.querySelector('.login-logo-img');
  var brandLogo = document.querySelector('.brand-logo-img');
  if(loginLogo && logoData){ loginLogo.src = logoData; loginLogo.style.display='block'; }
  if(brandLogo && logoData){ brandLogo.src = logoData; brandLogo.style.display='block'; }

  $('#today-badge').textContent = new Date().toLocaleDateString('en-GB',{ weekday:'short', day:'2-digit', month:'short' });
  applyRoleVisibility();
  var landing = 'dashboard';
  if(!hasAccess('dashboard')){
    var mods = (currentUserData && currentUserData.modules) || [];
    landing = mods[0] || 'counter';
  }
  navigateTo(landing);
}

/* ═══════════ NAVIGATION ═══════════ */
var TITLES = {
  dashboard:'Dashboard', counter:'Counter (Retail)', wholesale:'Wholesale',
  inventory:'Inventory', purchases:'Purchases', purchaseorders:'Purchase Orders',
  customerorders:'Customer Orders', returns:'Returns', customers:'Customers',
  suppliers:'Suppliers', sales:'Sales History', reports:'Reports', expiry:'Expiry Report',
  reorder:'Auto Reorder', audit:'Audit Log', dayclose:'Day Close',
  staff:'Staff', presets:'Quick Packs', settings:'Settings'
};

function navigateTo(v){
  if(!loggedIn) return;
  if(!hasAccess(v)){ toast('Access denied', 'err'); return; }
  var wasCounterView = (currentView === 'counter' || currentView === 'wholesale');
  var isCounterView = (v === 'counter' || v === 'wholesale');
  if(wasCounterView && !isCounterView && cart.length > 0){
    if(!confirm('Cart mein ' + cart.length + ' items. Chhor dein?')) return;
    cart = [];
  }
  if(v === 'wholesale' && currentView !== 'wholesale' && cart.length > 0){
    if(!confirm('Mode change se cart clear hogi. Continue?')) return;
    cart = [];
  }
  currentView = v;
  if(!isCounterView){ counterLevel = 'groups'; selectedGroup = null; posQuery = ''; }
  if(v === 'wholesale'){ isWholesaleMode = true; selectedCustomer = 'c1'; } else { isWholesaleMode = false; }
  applyRoleVisibility();
  $$('.nav-btn').forEach(function(b){ b.classList.toggle('active', b.dataset.nav === v); });
  $('#page-title').textContent = TITLES[v] || v;
  var sb = $('#sidebar'); if(sb) sb.classList.remove('open');
  renderView();
}

function applyRoleVisibility(){
  var r = currentUserData ? currentUserData.role : 'owner';
  var allowed = null;
  if(r === 'staff') allowed = currentUserData.modules || ['counter','sales','customers'];
  $$('.nav-btn').forEach(function(b){
    if(!allowed){ b.style.display = ''; return; }
    b.style.display = allowed.indexOf(b.dataset.nav) >= 0 ? '' : 'none';
  });
}

function renderView(){
  var v = $('#view');
  if(!v) return;
  try{
    var html = '';
    switch(currentView){
      case 'dashboard': html = viewDashboard(); break;
      case 'counter': html = viewCounter(); break;
      case 'wholesale': html = viewCounter(); break;
      case 'inventory': html = viewInventory(); break;
      case 'purchases': html = viewPurchases(); break;
      case 'purchaseorders': html = viewPurchaseOrders(); break;
      case 'customerorders': html = viewCustomerOrders(); break;
      case 'returns': html = viewReturns(); break;
      case 'customers': html = viewCustomers(); break;
      case 'suppliers': html = viewSuppliers(); break;
      case 'sales': html = viewSales(); break;
      case 'reports': html = viewReports(); break;
      case 'expiry': html = viewExpiryReport(); break;
      case 'reorder': html = viewReorder(); break;
      case 'audit': html = viewAuditLog(); break;
      case 'dayclose': html = viewDayClose(); break;
      case 'staff': html = viewStaff(); break;
      case 'presets': html = viewPresets(); break;
      case 'settings': html = viewSettings(); break;
      default: html = viewDashboard();
    }
    v.innerHTML = html;
    if(currentView === 'counter' || currentView === 'wholesale') afterCounter();
    if(currentView === 'inventory') afterInventory();
    if(currentView === 'reports') setTimeout(runReport, 30);
    if(currentView === 'expiry') setTimeout(function(){ renderExpiryTable('30'); }, 30);
  }catch(e){
    console.error('renderView:', e);
    v.innerHTML = '<div class="alert alert-info"><b>Error:</b> '+esc(e.message)+'</div>';
  }
}

/* ═══════════ DASHBOARD ═══════════ */
function viewDashboard(){
  var today = todayISO();
  var sales = db.sales||[];
  var todaySales = sales.filter(function(s){ return s.date.slice(0,10) === today; });
  var todayTotal = todaySales.reduce(function(a,s){ return a+s.total; }, 0);
  var month = today.slice(0,7);
  var monthTotal = sales.filter(function(s){ return s.date.slice(0,7) === month; }).reduce(function(a,s){ return a+s.total; }, 0);
  var recv = db.customers.reduce(function(a,c){ return a+Math.max(0, ledgerBalance(c.ledger)); }, 0);
  var pay = db.suppliers.reduce(function(a,x){ return a+Math.max(0, ledgerBalance(x.ledger)); }, 0);
  var lowStock = db.products.filter(function(p){ return totalStock(p) <= (p.minStock||db.settings.lowStock); });
  var expiring = db.products.filter(function(p){ var d = daysUntil(nearestExpiry(p)); return d >= 0 && d <= db.settings.expiryDays; });
  var newCOs = (db.customerOrders||[]).filter(function(o){ return o.status === 'new'; }).length;
  var recent = sales.slice(-6).reverse();

  return '<div class="grid cols-4">' +
      '<div class="stat green"><div class="lbl">Today Sales</div><div class="val">'+money(todayTotal)+'</div><div class="sub">'+todaySales.length+' invoices</div></div>' +
      '<div class="stat blue"><div class="lbl">This Month</div><div class="val">'+money(monthTotal)+'</div></div>' +
      '<div class="stat warn"><div class="lbl">Receivables</div><div class="val">'+money(recv)+'</div></div>' +
      '<div class="stat red"><div class="lbl">Payables</div><div class="val">'+money(pay)+'</div></div>' +
    '</div>' +
    '<div class="grid cols-4 mt">' +
      '<div class="stat"><div class="lbl">Products</div><div class="val">'+db.products.length+'</div></div>' +
      '<div class="stat '+(lowStock.length?'warn':'')+'"><div class="lbl">Low Stock</div><div class="val">'+lowStock.length+'</div></div>' +
      '<div class="stat '+(expiring.length?'red':'')+'"><div class="lbl">Expiring</div><div class="val">'+expiring.length+'</div></div>' +
      '<div class="stat '+(newCOs?'blue':'')+'"><div class="lbl">New Orders</div><div class="val">'+newCOs+'</div></div>' +
    '</div>' +
    '<div class="grid cols-2 mt">' +
      '<div class="card"><h3>Recent Invoices</h3>' +
        (recent.length
          ? '<div class="table-wrap"><table><thead><tr><th>Slip #</th><th>Customer</th><th>Type</th><th class="right">Amount</th></tr></thead><tbody>' +
            recent.map(function(s){
              return '<tr><td class="mono">'+esc(s.slipNo||'—')+'</td><td>'+esc(s.customerName||'Walk-in')+'</td>' +
                '<td><span class="pill '+(s.saleType==='wholesale'?'purple':'ok')+'">'+(s.saleType==='wholesale'?'WS':'Retail')+'</span></td>' +
                '<td class="right mono">'+money(s.total)+'</td></tr>';
            }).join('') + '</tbody></table></div>'
          : '<div class="empty">No sales yet.</div>') +
      '</div>' +
      '<div class="card"><h3>Low Stock</h3>' +
        (lowStock.length
          ? '<div class="table-wrap"><table><thead><tr><th>Medicine</th><th class="right">Stock</th></tr></thead><tbody>' +
            lowStock.slice(0,8).map(function(p){ return '<tr><td>'+esc(p.name)+'</td><td class="right mono">'+stockDisplay(p)+'</td></tr>'; }).join('') +
            '</tbody></table></div>'
          : '<div class="empty">All good.</div>') +
      '</div>' +
    '</div>';
}

/* ═══════════ COUNTER ═══════════ */
function viewCounter(){
  var cust = findCustomer(selectedCustomer);
  var custName = (cust && cust.id !== 'c1') ? cust.name : '';
  var leftPanel = '';

  if(counterLevel === 'groups'){
    var presets = db.settings.presets||{};
    var presetHtml = '<div class="preset-strip"><span class="preset-label">Quick Packs:</span>';
    if(!isWholesaleMode){
      Object.keys(presets).forEach(function(name){
        presetHtml += '<span class="preset-chip" data-preset="'+esc(name)+'">'+esc(name)+'</span>';
      });
      presetHtml += '<button type="button" class="preset-add" data-action="new-preset">+ New Pack</button>';
    } else {
      presetHtml += '<span class="muted" style="font-size:12px;">Wholesale mode</span>';
    }
    presetHtml += '</div>';

    var groups = getAllGroups();
    var tilesHtml = '<div class="group-tiles">'+groups.map(function(g){
      var count = db.products.filter(function(p){ return (p.group||'Other') === g.key; }).length;
      if(!count) return '';
      return '<div class="group-tile" data-group="'+g.key+'">' +
        '<div class="gt-badge" style="background:'+g.color+';color:'+g.text+';">'+g.short+'</div>' +
        '<div class="gt-name">'+esc(g.label)+'</div>' +
        '<div class="gt-count">'+count+' medicine'+(count>1?'s':'')+'</div>' +
      '</div>';
    }).join('')+'</div>';
    leftPanel = presetHtml + tilesHtml;
  } else {
    var grpProds, titleText;
    if(selectedGroup === null){ grpProds = db.products.slice(); titleText = 'Search Results'; }
    else { var gi = getGroupInfo(selectedGroup); grpProds = db.products.filter(function(p){ return (p.group||'Other') === selectedGroup; }); titleText = gi.label; }
    var q = posQuery.toLowerCase().trim();
    if(q){
      grpProds = grpProds.filter(function(p){
        return p.name.toLowerCase().indexOf(q) >= 0 || (p.company||'').toLowerCase().indexOf(q) >= 0 ||
          (p.generic||'').toLowerCase().indexOf(q) >= 0 || (p.barcode||'').toLowerCase().indexOf(q) >= 0;
      });
    }
    leftPanel = '<div class="back-bar">' +
      '<button type="button" class="back-btn" id="back-to-groups">← Back</button>' +
      '<h3>'+esc(titleText)+' ('+grpProds.length+')</h3></div>' +
      (grpProds.length ? '<div class="prod-grid">'+grpProds.map(prodBox).join('')+'</div>' : '<div class="empty">Koi medicine nahi mili.</div>');
  }

  var wsCustomers = db.customers.filter(function(c){ return c.type === 'wholesale'; });
  var wsBanner = isWholesaleMode
    ? '<div class="alert alert-info" style="margin-bottom:14px;"><b>🏪 Wholesale Mode</b> — Customer select zaroori.</div>'
    : '';

  var heldCount = (db.held||[]).length;
  var heldBtn = heldCount > 0
    ? '<button type="button" class="btn warn" id="pos-held" style="margin-bottom:10px;width:100%;">📦 Held Orders ('+heldCount+')</button>'
    : '';

  return wsBanner +
    '<div class="counter-layout">' +
      '<div>' +
        '<div class="scan-bar" style="display:flex;gap:8px;align-items:center;">' +
          '<input id="pos-search" placeholder="📷 Scan barcode ya search..." value="'+esc(posQuery)+'" autocomplete="off" style="flex:1;"/>' +
          '<button type="button" class="btn" id="pos-camera-btn" title="Camera scan" style="flex-shrink:0;">📷</button>' +
        '</div>' +
        heldBtn +
        leftPanel +
      '</div>' +
      '<div class="cart-box">' +
        '<div class="cart-header"><h3>'+(isWholesaleMode?'Wholesale Invoice':'Invoice')+'</h3><span class="muted" id="cart-count">0 items</span></div>' +
        '<div class="cart-meta">' +
          '<div class="field"><label>'+(isWholesaleMode?'Wholesale Store (zaroori)':'Customer (khali = Walk-in)')+'</label>' +
            '<input id="pos-customer-input" list="pos-cust-list" placeholder="Naam likho..." value="'+esc(custName)+'" autocomplete="off"/>' +
            '<datalist id="pos-cust-list">' +
              (isWholesaleMode ? wsCustomers : db.customers.filter(function(c){ return c.id !== 'c1' && c.type !== 'wholesale'; }))
              .map(function(c){ return '<option value="'+esc(c.name)+'"></option>'; }).join('') +
            '</datalist>' +
          '</div>' +
          '<div class="field"><label>Doctor (optional)</label><input id="pos-doctor" placeholder="Dr. Ahmed" value="'+esc(doctorName)+'"/></div>' +
          '<div class="field"><label>Discount ('+esc(db.settings.currency)+')</label><input type="number" id="pos-discount" value="0" min="0" step="any"/></div>' +
        '</div>' +
        '<div class="cart-items" id="cart-items"></div>' +
        '<div class="totals" id="pos-totals"></div>' +
        '<div class="field mt"><label>Payment</label><div class="pay-tabs" id="pay-tabs">' +
          '<button type="button" data-pay="Cash" class="'+(payMode==='Cash'?'active':'')+'">Cash</button>' +
          '<button type="button" data-pay="Card" class="'+(payMode==='Card'?'active':'')+'">Card</button>' +
          '<button type="button" data-pay="Credit" class="'+(payMode==='Credit'?'active':'')+'">Credit</button>' +
        '</div></div>' +
        '<div class="cart-fixed-bottom">' +
          '<button type="button" class="btn primary block" id="pos-checkout" style="padding:13px;font-size:14px;">Save & Print (F8)</button>' +
          '<div class="flex mt" style="gap:8px;">' +
            '<button type="button" class="btn grow warn" id="pos-hold">⏸ Hold (F9)</button>' +
            '<button type="button" class="btn grow" id="pos-clear">Clear</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
}

function prodBox(p){
  var st = totalStock(p);
  var exp = nearestExpiry(p);
  var dleft = daysUntil(exp);
  var b = (p.batches||[]).filter(function(x){ return x.qty>0; }).sort(function(a,z){ return new Date(a.expiry)-new Date(z.expiry); })[0];
  var cls = 'ok', txt = 'OK';
  if(st === 0){ cls = 'red'; txt = 'Out'; }
  else if(st <= (p.minStock||db.settings.lowStock)){ cls = 'warn'; txt = 'Low'; }
  if(dleft < 0){ cls = 'red'; txt = 'Expired'; }
  else if(dleft <= db.settings.expiryDays && st > 0){ cls = 'warn'; txt = 'Exp soon'; }

  var packLabel = p.packing || (p.packSize > 1 ? 'Strip of ' + p.packSize : p.unitLabel);
  var displayPrice = b ? (isWholesaleMode && b.wholesalePrice ? b.wholesalePrice : b.mrp) : 0;
  var bcLine = p.barcode ? '<div style="font-size:9.5px;color:var(--muted);margin-top:3px;font-family:monospace;">🏷️ ' + esc(p.barcode) + '</div>' : '';

  return '<div class="prod-box" data-sell="'+p.id+'">' +
    '<div class="pb-head"><div class="pb-name">'+esc(p.name)+'</div><span class="pill '+cls+'">'+txt+'</span></div>' +
    '<div class="pb-meta">'+esc(p.company||'—')+' · '+esc(packLabel)+'<br>'+(exp?'Exp: '+fmtDate(exp):'')+bcLine+'</div>' +
    '<div class="pb-foot" style="flex-direction:column;align-items:stretch;gap:2px;">' +
      '<div style="display:flex;justify-content:space-between;"><span style="font-size:11px;color:var(--muted);">'+(isWholesaleMode?'WS Price:':'Pack:')+'</span><span class="pb-price">'+(b?money(displayPrice):'—')+'</span></div>' +
      '<div style="display:flex;justify-content:space-between;margin-top:4px;"><span style="font-size:11px;color:var(--muted);">Stock:</span><span class="pb-stock">'+stockDisplay(p)+'</span></div>' +
    '</div>' +
  '</div>';
}

function openSellModal(p){
  var b = (p.batches||[]).filter(function(x){ return x.qty > 0; }).sort(function(a,z){ return new Date(a.expiry)-new Date(z.expiry); })[0];
  if(!b){ toast('Out of stock', 'err'); return; }
  var canLoose = p.packSize > 1 && b.loosePrice > 0 && !isWholesaleMode;
  var wsPrice = b.wholesalePrice || b.mrp;

  var body = '<div style="margin-bottom:14px;">' +
      '<div style="font-size:15px;font-weight:800;">'+esc(p.name)+'</div>' +
      '<div class="muted">'+esc(p.company||'')+' · '+esc(p.packing||'')+'</div>' +
      '<div class="muted">Batch: '+esc(b.batch)+' · Stock: '+b.qty+' '+(p.unitLabel||'units')+'</div>' +
      (p.barcode ? '<div class="muted" style="font-family:monospace;">🏷️ '+esc(p.barcode)+'</div>' : '') +
    '</div>' +
    (isWholesaleMode
      ? '<div class="alert alert-info"><b>Wholesale Price:</b> '+money(wsPrice)+'<br><span class="muted">Retail: '+money(b.mrp)+'</span></div>'
      : (canLoose
        ? '<div class="pay-tabs" id="sell-mode">' +
            '<button type="button" data-mode="pack" class="active">Full Pack ('+money(b.mrp)+')</button>' +
            '<button type="button" data-mode="loose">Loose ('+money(b.loosePrice)+' / '+esc(p.unitLabel||'Tab')+')</button>' +
          '</div>'
        : '<div style="padding:10px;background:rgba(2,132,199,.1);border-radius:8px;font-size:12px;margin-bottom:14px;">Sirf pack mein milta hai</div>')
    ) +
    '<div class="field"><label>Quantity <span id="qty-unit">(packs)</span></label>' +
      '<div style="display:flex;align-items:center;gap:8px;">' +
        '<button type="button" class="btn" id="qty-minus" style="width:44px;justify-content:center;font-size:18px;">−</button>' +
        '<input type="number" id="sell-qty" value="1" min="1" step="1" style="text-align:center;font-size:16px;font-weight:700;"/>' +
        '<button type="button" class="btn" id="qty-plus" style="width:44px;justify-content:center;font-size:18px;">+</button>' +
      '</div>' +
    '</div>' +
    '<div style="background:var(--panel2);border-radius:10px;padding:14px;text-align:center;">' +
      '<div class="muted" style="font-size:11px;text-transform:uppercase;font-weight:700;">Total</div>' +
      '<div id="sell-price" style="font-size:24px;font-weight:800;color:var(--primary);margin-top:4px;">'+money(isWholesaleMode?wsPrice:b.mrp)+'</div>' +
    '</div>';

  var bg = openModal('Sell — '+p.name, body,
    '<button type="button" class="btn" data-close>Cancel</button>' +
    '<button type="button" class="btn primary" id="sell-add">Add to Cart</button>');

  var mode = 'pack';
  var price = isWholesaleMode ? wsPrice : b.mrp;

  setTimeout(function(){
    function updatePrice(){
      var qty = Math.max(1, parseInt(document.getElementById('sell-qty').value) || 1);
      document.getElementById('sell-price').textContent = money(qty * price);
    }
    var tabs = document.getElementById('sell-mode');
    if(tabs){
      tabs.addEventListener('click', function(e){
        var btn = e.target.closest('[data-mode]');
        if(!btn) return;
        mode = btn.dataset.mode;
        price = mode === 'pack' ? b.mrp : b.loosePrice;
        $$('#sell-mode button').forEach(function(x){ x.classList.remove('active'); });
        btn.classList.add('active');
        document.getElementById('qty-unit').textContent = mode === 'pack' ? '(packs)' : '(' + (p.unitLabel||'Tab') + 's)';
        updatePrice();
      });
    }
    var qty = document.getElementById('sell-qty');
    qty.addEventListener('input', updatePrice);
    document.getElementById('qty-minus').addEventListener('click', function(){
      var v = parseInt(qty.value) || 1;
      if(v > 1) qty.value = v - 1;
      updatePrice();
    });
    document.getElementById('qty-plus').addEventListener('click', function(){
      qty.value = (parseInt(qty.value) || 1) + 1;
      updatePrice();
    });
    document.getElementById('sell-add').addEventListener('click', function(){
      var q = Math.max(1, parseInt(qty.value) || 1);
      var unitsNeeded = mode === 'pack' ? q * p.packSize : q;
      var alreadyInCart = cartUnitsInBatch(b.id, -1);
      var avail = b.qty - alreadyInCart;
      if(unitsNeeded > avail){ toast('Sirf ' + Math.max(0, avail) + ' units available', 'err'); return; }
      addToCart(p.id, b.id, mode, q, isWholesaleMode);
      bg.remove();
    });
    qty.focus(); qty.select();
  }, 30);
}

/* ═══════════ CART ═══════════ */
function addToCart(pid, bid, mode, qty, wholesale){
  mode = mode || 'pack';
  qty = qty || 1;
  var p = findProduct(pid);
  if(!p) return;
  var b = p.batches.find(function(x){ return x.id === bid; });
  if(!b) return;
  var unitsNeeded = mode === 'pack' ? qty * p.packSize : qty;
  var alreadyInCart = cartUnitsInBatch(bid, -1);
  var avail = b.qty - alreadyInCart;
  if(unitsNeeded > avail){ toast('Sirf ' + Math.max(0, avail) + ' units', 'err'); return; }
  var existing = cart.find(function(c){
    return c.productId === pid && c.batchId === bid && c.mode === mode && c.wholesale === !!wholesale;
  });
  var unitPrice = wholesale ? (b.wholesalePrice || b.mrp) : (mode === 'pack' ? b.mrp : b.loosePrice);
  if(existing){ existing.qty += qty; }
  else {
    cart.push({
      productId: pid, batchId: bid, mode: mode, wholesale: !!wholesale,
      name: p.name, batch: b.batch, expiry: b.expiry,
      packSize: p.packSize, unitLabel: p.unitLabel,
      unitPrice: unitPrice, qty: qty,
      cost: mode === 'pack' ? b.cost : (b.cost / p.packSize)
    });
  }
  renderCart();
  toast('+ '+p.name+' ('+qty+' '+(mode==='pack'?'pack':(p.unitLabel||'unit'))+')');
}

function renderCart(){
  var box = $('#cart-items');
  if(!box) return;
  if(!cart.length){
    box.innerHTML = '<div class="empty" style="padding:22px;">Cart khali hai.</div>';
  } else {
    box.innerHTML = cart.map(function(c, i){
      var unitTxt = c.mode === 'pack' ? 'pack' : c.unitLabel;
      var wsTag = c.wholesale ? ' <span class="pill purple" style="font-size:9px;padding:1px 6px;">WS</span>' : '';
      return '<div class="cart-row">' +
        '<div><div class="cn">'+esc(c.name)+wsTag+'</div>' +
        '<div class="cm">'+esc(c.batch)+' · '+money(c.unitPrice)+' / '+unitTxt+'</div></div>' +
        '<div class="qty">' +
          '<button type="button" data-q="-1" data-i="'+i+'">−</button>' +
          '<input type="number" data-qty-input="'+i+'" value="'+c.qty+'" min="1"/>' +
          '<button type="button" data-q="1" data-i="'+i+'">+</button>' +
        '</div>' +
        '<div class="amt">'+money(c.qty*c.unitPrice)+'</div>' +
        '<button type="button" class="rm" data-rm="'+i+'">×</button>' +
      '</div>';
    }).join('');
  }

  // Loyalty display
  var cartBox = document.querySelector('.cart-box');
  if(cartBox && !isWholesaleMode){
    var custInput = document.querySelector('#pos-customer-input');
    if(custInput){
      var nm = custInput.value.trim();
      if(nm){
        var cust = db.customers.find(function(c){ return c.name.toLowerCase() === nm.toLowerCase(); });
        var old = cartBox.querySelector('.loyalty-points-display');
        if(old) old.remove();
        if(cust && cust.points > 0){
          var div = document.createElement('div');
          div.className = 'loyalty-points-display';
          div.style.cssText = 'background:rgba(22,163,74,.08);border:1px solid rgba(22,163,74,.25);padding:10px 12px;font-size:12px;margin:8px 0;border-radius:10px;';
          div.innerHTML = '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;">' +
              '<input type="checkbox" id="pos-use-points" style="width:auto;min-height:auto;"/>' +
              '<span>🎁 <b>' + cust.points + ' points</b> (worth ' + money(cust.points * POINTS_VALUE) + ')</span>' +
            '</label>';
          var totals = cartBox.querySelector('.totals');
          if(totals) cartBox.insertBefore(div, totals);
          else cartBox.appendChild(div);
          var chk = document.getElementById('pos-use-points');
          if(chk && !chk.dataset.bound){
            chk.dataset.bound = '1';
            chk.checked = !!useLoyaltyPoints;
            chk.addEventListener('change', function(){
              useLoyaltyPoints = this.checked;
              updateTotals();
            });
          }
        }
        // Credit warning
        if(cust && cust.id !== 'c1'){
          var balance = ledgerBalance(cust.ledger);
          if(balance > 0){
            var warnDiv = document.createElement('div');
            warnDiv.className = 'credit-warning';
            warnDiv.style.cssText = 'background:rgba(220,38,38,.08);border:1px solid rgba(220,38,38,.25);padding:8px 12px;font-size:11.5px;margin:8px 0;border-radius:10px;color:var(--danger);font-weight:600;';
            warnDiv.innerHTML = '⚠️ Purana Udhaar: <b>' + money(balance) + '</b>';
            var totals2 = cartBox.querySelector('.totals');
            if(totals2) cartBox.insertBefore(warnDiv, totals2);
            else cartBox.appendChild(warnDiv);
          }
        }
      }
    }
  }

  box.onclick = function(e){
    var rm = e.target.closest('[data-rm]');
    if(rm){ cart.splice(+rm.dataset.rm, 1); renderCart(); return; }
    var b = e.target.closest('[data-q]');
    if(!b) return;
    var i = +b.dataset.i, d = +b.dataset.q, c = cart[i];
    if(d < 0){ c.qty--; if(c.qty <= 0) cart.splice(i, 1); }
    else {
      var p = findProduct(c.productId);
      var batchObj = p.batches.find(function(x){ return x.id === c.batchId; });
      var newUnit = c.mode === 'pack' ? p.packSize : 1;
      var otherInCart = cartUnitsInBatch(c.batchId, i);
      if(otherInCart + (c.qty + 1) * newUnit > batchObj.qty){ toast('Batch max stock', 'warn'); return; }
      c.qty++;
    }
    renderCart();
  };

  box.oninput = function(e){
    var inp = e.target.closest('[data-qty-input]');
    if(!inp) return;
    var i = +inp.dataset.qtyInput;
    var c = cart[i];
    if(!c) return;
    var v = parseInt(inp.value) || 1;
    if(v < 1) v = 1;
    var p = findProduct(c.productId);
    var batchObj = p.batches.find(function(x){ return x.id === c.batchId; });
    var newUnit = c.mode === 'pack' ? p.packSize : 1;
    var otherInCart = cartUnitsInBatch(c.batchId, i);
    var maxAllowed = Math.floor((batchObj.qty - otherInCart) / newUnit);
    if(maxAllowed < 1) maxAllowed = 1;
    if(v > maxAllowed){ v = maxAllowed; toast('Max stock: ' + maxAllowed, 'warn'); }
    c.qty = v;
    inp.value = v;
    updateTotals();
    var row = inp.closest('.cart-row');
    if(row){ var amtEl = row.querySelector('.amt'); if(amtEl) amtEl.textContent = money(c.qty * c.unitPrice); }
  };

  updateTotals();
}

function computeTotals(){
  var sub = 0;
  cart.forEach(function(c){ sub += c.qty * c.unitPrice; });
  var overall = +(($('#pos-discount')||{}).value) || 0;
  var afterDisc = Math.max(0, sub - overall);
  var taxRate = db.settings.taxEnabled ? (+db.settings.taxRate || 0) : 0;
  var tax = afterDisc * taxRate / 100;
  var c = { sub:sub, overall:overall, taxRate:taxRate, tax:tax, total:afterDisc+tax, pointsUsed:0, pointsDiscount:0 };
  if(useLoyaltyPoints && selectedCustomer && selectedCustomer !== 'c1'){
    var cust = findCustomer(selectedCustomer);
    if(cust && cust.points > 0){
      var subtotalAfterDisc = Math.max(0, sub - overall);
      var maxPts = Math.min(cust.points, Math.floor(subtotalAfterDisc / POINTS_VALUE));
      c.pointsUsed = maxPts;
      c.pointsDiscount = maxPts * POINTS_VALUE;
      var afterPoints = Math.max(0, subtotalAfterDisc - c.pointsDiscount);
      c.tax = afterPoints * taxRate / 100;
      c.total = afterPoints + c.tax;
    }
  }
  return c;
}

function updateTotals(){
  var t = $('#pos-totals');
  if(!t) return;
  var c = computeTotals();
  t.innerHTML =
    '<div class="tot-row"><span class="l">Subtotal</span><span class="mono">'+money(c.sub)+'</span></div>' +
    (c.overall ? '<div class="tot-row"><span class="l">Discount</span><span class="mono">− '+money(c.overall)+'</span></div>' : '') +
    (c.pointsDiscount ? '<div class="tot-row"><span class="l">Points</span><span class="mono">− '+money(c.pointsDiscount)+'</span></div>' : '') +
    (c.taxRate ? '<div class="tot-row"><span class="l">'+esc(db.settings.taxLabel||'GST')+' '+c.taxRate+'%</span><span class="mono">+ '+money(c.tax)+'</span></div>' : '') +
    '<div class="tot-row big"><span class="l">TOTAL</span><span class="mono">'+money(c.total)+'</span></div>';
  var cc = $('#cart-count');
  if(cc) cc.textContent = cart.reduce(function(a,x){ return a+x.qty; }, 0)+' items';
}

function nextInvoiceNo(){ var s=db.settings; var n=(s.invoicePrefix||'INV-')+String(s.nextInvoice||1).padStart(5,'0'); s.nextInvoice=(s.nextInvoice||1)+1; return n; }
function nextSlipNo(){ var s=db.settings; var n=(s.slipPrefix||'SLP-')+String(s.nextSlip||1).padStart(5,'0'); s.nextSlip=(s.nextSlip||1)+1; return n; }
function nextWholesaleNo(){ var s=db.settings; var n=(s.wsPrefix||'WS-')+String(s.nextWholesale||1).padStart(5,'0'); s.nextWholesale=(s.nextWholesale||1)+1; return n; }
function nextPONumber(){ var s=db.settings; var n=(s.poPrefix||'PO-')+String(s.nextPO||1).padStart(5,'0'); s.nextPO=(s.nextPO||1)+1; return n; }

/* ═══════════ CHECKOUT ═══════════ */
function checkout(){
  if(!cart.length){ toast('Cart empty', 'err'); return; }
  var custInput = $('#pos-customer-input');
  var cust = null;
  if(custInput && custInput.value.trim()){
    var nm = custInput.value.trim();
    cust = db.customers.find(function(c){ return c.name.toLowerCase() === nm.toLowerCase(); });
    if(!cust){
      cust = { id:uid('c'), name:nm, phone:'', address:'', ledger:[], points:0, type: isWholesaleMode ? 'wholesale' : 'retail' };
      db.customers.push(cust);
      addAuditLog('Customer Created', nm + ' (' + cust.type + ')');
    }
  } else {
    if(isWholesaleMode){ toast('Wholesale ke liye customer zaroori', 'err'); if(custInput) custInput.focus(); return; }
    cust = findCustomer(selectedCustomer) || db.customers[0];
  }
  var c = computeTotals();
  if(payMode === 'Credit'){
    var limitCheck = checkCreditLimit(cust, c.total);
    if(!limitCheck.ok){
      confirmAction('Credit Limit Exceed', limitCheck.msg.replace(/\n/g, ' · '), function(){
        doCheckoutProceed(cust, c);
      });
      return;
    }
  }
  doCheckoutProceed(cust, c);
}

function doCheckoutProceed(cust, c){
  cart.forEach(function(it){
    var p = findProduct(it.productId);
    if(!p) return;
    var b = p.batches.find(function(x){ return x.id === it.batchId; });
    if(!b) return;
    var units = it.mode === 'pack' ? it.qty * p.packSize : it.qty;
    b.qty = Math.max(0, b.qty - units);
  });
  var invoiceNo = isWholesaleMode ? nextWholesaleNo() : nextInvoiceNo();
  var slipNo = nextSlipNo();
  var sale = {
    id: uid('sale'), invoiceNo: invoiceNo, slipNo: slipNo, date: new Date().toISOString(),
    saleType: isWholesaleMode ? 'wholesale' : 'retail',
    customerId: cust.id, customerName: cust.name, customerPhone: cust.phone || '',
    customerAddress: cust.address || '', customerBusiness: cust.business || '', customerNTN: cust.ntn || '',
    doctor: doctorName,
    items: cart.map(function(x){
      return { productId: x.productId, batchId: x.batchId, mode: x.mode, wholesale: x.wholesale,
        name: x.name, batch: x.batch, expiry: x.expiry, packSize: x.packSize, unitLabel: x.unitLabel,
        qty: x.qty, unitPrice: x.unitPrice, cost: x.cost, total: x.qty * x.unitPrice };
    }),
    subtotal: c.sub, discount: c.overall,
    pointsUsed: c.pointsUsed || 0,
    pointsDiscount: c.pointsDiscount || 0,
    taxRate: c.taxRate, taxAmount: c.tax, taxLabel: db.settings.taxLabel || 'GST',
    total: c.total, payMode: payMode,
    user: currentUserData ? currentUserData.name : 'admin'
  };
  db.sales.push(sale);
  
  if(payMode === 'Credit' && cust.id !== 'c1'){
    cust.ledger = cust.ledger || [];
    cust.ledger.push({ id: uid('l'), date: sale.date, type:'sale', amount: c.total, note: invoiceNo });
  }

  if(c.pointsUsed > 0){
    redeemPoints(cust, c.pointsUsed);
    addAuditLog('Loyalty Points Redeemed', cust.name + ' − ' + c.pointsUsed + ' points');
  }
  var earnedPoints = earnPoints(cust, c.total);
  if(earnedPoints > 0) addAuditLog('Loyalty Points Earned', cust.name + ' + ' + earnedPoints + ' points');

  addAuditLog(sale.saleType === 'wholesale' ? 'Wholesale Sale' : 'Sale Created',
    invoiceNo + ' · ' + cust.name + ' · ' + money(c.total));
  saveDb();
  
  // Print
  if(sale.saleType === 'wholesale' || db.settings.receiptType === 'a4'){ printA4Invoice(sale); }
  else { printReceipt(sale); }
  
  // ═══ CREDIT BILL WHATSAPP AUTO SEND ═══
  if(payMode === 'Credit' && cust.id !== 'c1' && cust.phone){
    var sendNow = db.settings.autoSendCreditBill !== false;
    var shouldSend = sendNow ? true : confirm('📱 Credit bill WhatsApp pe bhejein?\n\nCustomer: ' + cust.name + '\nPhone: ' + cust.phone + '\nBill: ' + money(c.total));
    if(shouldSend){
      setTimeout(function(){
        sendCreditBillWhatsApp(cust, sale);
      }, 800);
    }
  } else if(payMode === 'Credit' && cust.id !== 'c1' && !cust.phone){
    toast('⚠ Customer ka phone number nahi — bill nahi bhej sakte', 'warn');
  }
  
  cart = []; payMode = 'Cash'; doctorName = '';
  useLoyaltyPoints = false;
  toast('Saved · ' + invoiceNo + (earnedPoints > 0 ? ' · +' + earnedPoints + ' pts 🎁' : ''));
  renderView();
}

/* ═══════════ HOLD ═══════════ */
function holdSale(){
  if(!cart.length){ toast('Cart empty', 'err'); return; }
  db.held.push({ id:uid('h'), date:new Date().toISOString(), cart:JSON.parse(JSON.stringify(cart)),
    customerId:selectedCustomer, wholesale:isWholesaleMode });
  addAuditLog('Sale Held', cart.length + ' items');
  cart = [];
  saveDb();
  toast('⏸ Order held');
  renderView();
}

function openHeldModal(){
  var held = db.held||[];
  if(!held.length){ toast('Koi held order nahi', 'warn'); return; }
  var body = held.map(function(h, i){
    var total = h.cart.reduce(function(a,c){ return a + c.qty * c.unitPrice; }, 0);
    var cust = findCustomer(h.customerId);
    var custName = cust ? cust.name : 'Walk-in';
    return '<div class="ledger-row" style="cursor:pointer;" data-resume="'+i+'">' +
      '<div><div><b>' + h.cart.length + ' items</b>' + (h.wholesale?' <span class="pill purple">WS</span>':'') + '</div>' +
        '<div class="muted">'+esc(custName)+' · '+fmtDate(h.date)+'</div></div>' +
      '<div style="display:flex;gap:6px;align-items:center;">' +
        '<span class="mono">'+money(total)+'</span>' +
        '<button type="button" class="btn xs danger" data-delheld="'+i+'">×</button>' +
      '</div></div>';
  }).join('');
  var bg = openModal('📦 Held Orders', body, '<button type="button" class="btn" data-close>Close</button>');
  setTimeout(function(){
    bg.querySelector('.modal-body').onclick = function(e){
      var del = e.target.closest('[data-delheld]');
      if(del){
        e.stopPropagation();
        var i = +del.dataset.delheld;
        if(confirm('Delete held order?')){ db.held.splice(i, 1); saveDb(); bg.remove(); renderView(); }
        return;
      }
      var res = e.target.closest('[data-resume]');
      if(!res) return;
      var idx = +res.dataset.resume;
      var h = db.held[idx];
      if(!h) return;
      cart = JSON.parse(JSON.stringify(h.cart));
      isWholesaleMode = !!h.wholesale;
      selectedCustomer = h.customerId || 'c1';
      db.held.splice(idx, 1);
      saveDb();
      bg.remove();
      navigateTo(h.wholesale ? 'wholesale' : 'counter');
      toast('✓ Order resumed');
    };
  }, 30);
}

function afterCounter(){
  var s = $('#pos-search');
  if(s){
    s.focus();
    var barcodeTimer = null;
    
    s.addEventListener('input', function(){
      var val = s.value;
      posQuery = val;
      var q = posQuery.trim();
      
      // Barcode scanner detection — 6+ digits/letters, no spaces
      if(/^[A-Za-z0-9]{6,}$/.test(q)){
        clearTimeout(barcodeTimer);
        barcodeTimer = setTimeout(function(){
          if(s.value.trim() !== q) return;
          var hit = db.products.find(function(p){ return (p.barcode||'') === q; });
          if(hit){
            openSellModal(hit);
            s.value = '';
            posQuery = '';
            return;
          }
        }, 120);
        return;
      }
      
      if(q.length > 0){ if(counterLevel === 'groups'){ counterLevel = 'products'; selectedGroup = null; } }
      else { if(counterLevel === 'products' && selectedGroup === null) counterLevel = 'groups'; }
      clearTimeout(window.__posTimer);
      window.__posTimer = setTimeout(function(){
        renderView();
        setTimeout(function(){ var el = $('#pos-search'); if(el){ el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 20);
      }, 200);
    });
    
    s.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){
        e.preventDefault();
        clearTimeout(barcodeTimer);
        var q = s.value.trim().toLowerCase();
        if(!q) return;
        var hit = db.products.find(function(p){ return (p.barcode||'').toLowerCase() === q; });
        if(!hit) hit = db.products.find(function(p){ return p.name.toLowerCase().indexOf(q) >= 0; });
        if(hit){ openSellModal(hit); s.value=''; posQuery=''; }
        else toast('Not found: '+q, 'err');
      }
    });
  }
  
  // Camera scan button
  var camBtn = $('#pos-camera-btn');
  if(camBtn){
    camBtn.addEventListener('click', function(){
      if(typeof window.openCameraScanner === 'function'){ window.openCameraScanner(handleCameraScan); }
      else { toast('Camera module load nahi hua', 'err'); }
    });
  }
  
  function handleCameraScan(code){
    var hit = db.products.find(function(p){ return p.barcode === code; });
    if(hit){ openSellModal(hit); }
    else { toast('Barcode not found: ' + code, 'err'); }
  }
  
  var gt = $('.group-tiles');
  if(gt) gt.addEventListener('click', function(e){
    var tile = e.target.closest('[data-group]');
    if(!tile) return;
    counterLevel = 'products'; selectedGroup = tile.dataset.group; posQuery = '';
    renderView();
  });
  var ps = $('.preset-strip');
  if(ps) ps.addEventListener('click', function(e){
    var presetBtn = e.target.closest('[data-preset]');
    if(presetBtn){ applyPreset(presetBtn.dataset.preset); return; }
    if(e.target.closest('[data-action="new-preset"]')){ e.preventDefault(); openPresetEditor(null); }
  });
  var bb = $('#back-to-groups');
  if(bb) bb.addEventListener('click', function(){ counterLevel='groups'; selectedGroup=null; posQuery=''; renderView(); });
  var pg = document.querySelector('.prod-grid');
  if(pg) pg.addEventListener('click', function(e){
    var it = e.target.closest('[data-sell]');
    if(!it) return;
    e.stopPropagation();
    var prod = findProduct(it.dataset.sell);
    if(prod) openSellModal(prod);
  });
  var pc = $('#pos-customer-input');
  if(pc){
    pc.addEventListener('change', function(){
      var nm = pc.value.trim();
      if(!nm){ selectedCustomer = 'c1'; renderCart(); return; }
      var found = db.customers.find(function(c){ return c.name.toLowerCase() === nm.toLowerCase(); });
      if(found){ selectedCustomer = found.id; toast('Selected: '+found.name); }
      else {
        var nc = { id:uid('c'), name:nm, phone:'', address:'', ledger:[], points:0, type: isWholesaleMode ? 'wholesale' : 'retail' };
        db.customers.push(nc);
        selectedCustomer = nc.id;
        addAuditLog('Customer Created', nm);
        saveDb();
        toast('New customer: '+nm);
      }
      renderCart();
    });
  }
  var doc = $('#pos-doctor'); if(doc) doc.addEventListener('input', function(e){ doctorName = e.target.value; });
  var pd = $('#pos-discount'); if(pd) pd.addEventListener('input', updateTotals);
  var pt = $('#pay-tabs');
  if(pt) pt.addEventListener('click', function(e){
    var b = e.target.closest('[data-pay]');
    if(!b) return;
    payMode = b.dataset.pay;
    $$('#pay-tabs button').forEach(function(x){ x.classList.toggle('active', x.dataset.pay === payMode); });
  });
  var ck = $('#pos-checkout'); if(ck) ck.addEventListener('click', checkout);
  var cl = $('#pos-clear'); if(cl) cl.addEventListener('click', function(){ if(cart.length && confirm('Clear cart?')){ cart = []; renderCart(); } });
  var hd = $('#pos-hold'); if(hd) hd.addEventListener('click', holdSale);
  var heldBtn = $('#pos-held'); if(heldBtn) heldBtn.addEventListener('click', openHeldModal);
  renderCart();
}

function applyPreset(name){
  var items = (db.settings.presets||{})[name];
  if(!items || !items.length){ toast('Preset khali', 'warn'); return; }
  var added = 0;
  items.forEach(function(medName){
    var p = db.products.find(function(x){ return x.name.toLowerCase() === medName.toLowerCase(); });
    if(p){
      var b = (p.batches||[]).filter(function(x){ return x.qty > 0; }).sort(function(a,z){ return new Date(a.expiry)-new Date(z.expiry); })[0];
      if(b){ addToCart(p.id, b.id, 'pack', 1, isWholesaleMode); added++; }
    }
  });
  if(added > 0) toast(name+' — '+added+' items added');
  else toast('Kuch add nahi hua', 'warn');
}

/* ═══════════ INVENTORY ═══════════ */
function viewInventory(){
  return '<div class="toolbar">' +
    '<input id="inv-search" placeholder="Search medicine..." style="flex:1;max-width:300px;"/>' +
    '<button type="button" class="btn primary" data-action="add-product">+ Add Product</button>' +
    '<button type="button" class="btn" data-action="add-category">+ Category</button>' +
    '<button type="button" class="btn" id="inv-bulk-barcode">📊 Bulk Barcode</button>' +
    '</div>' +
    '<div class="card"><div class="table-wrap" id="inv-wrap">'+invTable()+'</div></div>';
}
function invTable(){
  var q = (($('#inv-search')||{}).value||'').toLowerCase();
  var list = db.products.slice();
  if(q) list = list.filter(function(p){ 
    return p.name.toLowerCase().indexOf(q) >= 0 || (p.company||'').toLowerCase().indexOf(q) >= 0 || (p.barcode||'').indexOf(q) >= 0; 
  });
  if(!list.length) return '<div class="empty">No products.</div>';
  var rows = list.map(function(p){
    var st = totalStock(p);
    var exp = nearestExpiry(p);
    var b = (p.batches||[])[0];
    var cls = 'ok', txt = 'In Stock';
    if(st === 0){ cls = 'red'; txt = 'Out'; }
    else if(st <= (p.minStock||db.settings.lowStock)){ cls = 'warn'; txt = 'Low'; }
    return '<tr>' +
      '<td><strong>'+esc(p.name)+'</strong><div class="muted" style="font-family:monospace;font-size:10.5px;">'+(p.barcode?esc(p.barcode):'—')+'</div></td>' +
      '<td>'+esc(p.company||'')+'</td>' +
      '<td>'+esc(p.packing||'')+'</td>' +
      '<td class="right mono"><strong>'+stockDisplay(p)+'</strong></td>' +
      '<td>'+(exp?fmtDate(exp):'—')+'</td>' +
      '<td class="right mono">'+(b?money(b.mrp):'—')+'</td>' +
      '<td><span class="pill '+cls+'">'+txt+'</span></td>' +
      '<td class="center">' +
        '<button type="button" class="btn xs" data-action="edit-product" data-id="'+p.id+'">Edit</button> ' +
        '<button type="button" class="btn xs" data-action="add-batch" data-id="'+p.id+'">+Batch</button> ' +
        '<button type="button" class="btn xs" data-action="barcode" data-id="'+p.id+'" title="Barcode">📊</button> ' +
        '<button type="button" class="btn xs danger" data-action="del-product" data-id="'+p.id+'">×</button>' +
      '</td></tr>';
  }).join('');
  return '<table><thead><tr><th>Medicine</th><th>Company</th><th>Packing</th><th class="right">Stock</th><th>Expiry</th><th class="right">MRP</th><th>Status</th><th class="center">Actions</th></tr></thead><tbody>'+rows+'</tbody></table>';
}
function afterInventory(){
  var s = $('#inv-search');
  if(s) s.addEventListener('input', function(){ var w = $('#inv-wrap'); if(w) w.innerHTML = invTable(); });
  var b = document.getElementById('inv-bulk-barcode');
  if(b) b.addEventListener('click', printBulkBarcodes);
}

function openProductModal(p){
  var editing = !!p;
  var data = p || { name:'', company:'', generic:'', packing:'Strip of 10', category:'Tablet', group:'Other', minStock:10, barcode:'', packSize:10, unitLabel:'Tab' };
  if(!editing && !data.barcode) data.barcode = generateAutoBarcode();
  var groups = getAllGroups();
  if(data.group && !groups.find(function(g){ return g.key === data.group; })){ makeCustomGroup(data.group); groups = getAllGroups(); }
  var groupOpts = groups.map(function(g){
    return '<option value="'+esc(g.key)+'" '+(data.group===g.key?'selected':'')+'>'+esc(g.label)+'</option>';
  }).join('');

  var body =
    '<div class="row"><div class="field"><label>Name *</label><input id="f-name" value="'+esc(data.name)+'"/></div>' +
    '<div class="field"><label>Company</label><input id="f-company" value="'+esc(data.company||'')+'"/></div></div>' +
    '<div class="field"><label>Generic</label><input id="f-generic" value="'+esc(data.generic||'')+'"/></div>' +
    '<div class="field">' +
      '<label>Barcode (auto-generated)</label>' +
      '<div style="display:flex;gap:6px;">' +
        '<input id="f-barcode" value="'+esc(data.barcode||'')+'" placeholder="Scan or type..." style="flex:1;font-family:monospace;"/>' +
        '<button type="button" class="btn" id="f-bc-generate" title="Regenerate">🔄</button>' +
        '<button type="button" class="btn" id="f-bc-preview" title="Preview">👁</button>' +
      '</div>' +
      '<div id="f-bc-preview-box" style="display:none;margin-top:8px;background:#fff;padding:10px;border-radius:8px;border:1px solid var(--line);text-align:center;overflow-x:auto;"></div>' +
    '</div>' +
    '<div class="row"><div class="field"><label>Packing</label><input id="f-packing" value="'+esc(data.packing||'')+'"/></div>' +
    '<div class="field"><label>Category</label><select id="f-category">'+['Tablet','Capsule','Syrup','Injection','Cream','Drops','Other'].map(function(c){ return '<option '+(data.category===c?'selected':'')+'>'+c+'</option>'; }).join('')+'</select></div></div>' +
    '<div class="row-3">' +
      '<div class="field"><label>Pack Size *</label><input type="number" id="f-packSize" value="'+(data.packSize||10)+'" min="1"/></div>' +
      '<div class="field"><label>Unit Label</label><select id="f-unitLabel">'+['Tab','Cap','Bottle','Tube','Inj','pc'].map(function(u){ return '<option '+(data.unitLabel===u?'selected':'')+'>'+u+'</option>'; }).join('')+'</select></div>' +
      '<div class="field"><label>Min Stock</label><input type="number" id="f-minStock" value="'+(data.minStock||10)+'"/></div>' +
    '</div>' +
    '<div class="field"><label>Group / Category</label>' +
      '<div style="display:flex;gap:6px;">' +
        '<select id="f-group" style="flex:1;">'+groupOpts+'</select>' +
        '<button type="button" class="btn primary" id="f-new-group" style="padding:0 12px;">+ New</button>' +
      '</div>' +
    '</div>';

  var bg = openModal(editing ? 'Edit Product' : 'Add Product', body,
    '<button type="button" class="btn" data-close>Cancel</button>' +
    '<button type="button" class="btn primary" id="save-product-btn">Save</button>',
    { wide:true });

  setTimeout(function(){
    function updateBcPreview(){
      var val = document.getElementById('f-barcode').value.trim();
      var box = document.getElementById('f-bc-preview-box');
      if(!val){ box.innerHTML = '<div class="muted">Barcode khali</div>'; return; }
      try { box.innerHTML = generateBarcodeSVG(val, { width: 2, height: 50, showText: true }); }
      catch(e){ box.innerHTML = '<div style="color:red;font-size:11px;">' + e.message + '</div>'; }
    }
    
    var newGrpBtn = document.getElementById('f-new-group');
    if(newGrpBtn) newGrpBtn.addEventListener('click', function(){
      var name = prompt('Naya category name:');
      if(!name) return;
      name = name.trim();
      if(!name) return;
      var grp = makeCustomGroup(name);
      var sel = document.getElementById('f-group');
      var opt = document.createElement('option');
      opt.value = grp.key;
      opt.textContent = grp.label;
      opt.selected = true;
      sel.appendChild(opt);
      addAuditLog('Category Added', name);
      toast('✓ Category "' + name + '" created');
    });
    
    var bcGenBtn = document.getElementById('f-bc-generate');
    if(bcGenBtn) bcGenBtn.addEventListener('click', function(){
      document.getElementById('f-barcode').value = generateAutoBarcode();
      if(document.getElementById('f-bc-preview-box').style.display !== 'none') updateBcPreview();
      toast('✓ New barcode generated');
    });
    
    var bcPrevBtn = document.getElementById('f-bc-preview');
    if(bcPrevBtn) bcPrevBtn.addEventListener('click', function(){
      var box = document.getElementById('f-bc-preview-box');
      if(box.style.display === 'none'){ updateBcPreview(); box.style.display = 'block'; }
      else box.style.display = 'none';
    });
    
    var bcInput = document.getElementById('f-barcode');
    if(bcInput) bcInput.addEventListener('input', function(){
      if(document.getElementById('f-bc-preview-box').style.display !== 'none') updateBcPreview();
    });

    var btn = bg.querySelector('#save-product-btn');
    if(!btn) return;
    btn.addEventListener('click', function(ev){
      ev.preventDefault();
      var name = document.getElementById('f-name').value.trim();
      if(!name){ toast('Name required', 'err'); return; }
      var packSize = +document.getElementById('f-packSize').value || 0;
      if(packSize < 1){ toast('Pack size min 1', 'err'); return; }
      var d = {
        name: name,
        barcode: document.getElementById('f-barcode').value.trim() || generateAutoBarcode(),
        company: document.getElementById('f-company').value.trim(),
        generic: document.getElementById('f-generic').value.trim(),
        packing: document.getElementById('f-packing').value.trim(),
        category: document.getElementById('f-category').value,
        packSize: packSize,
        unitLabel: document.getElementById('f-unitLabel').value,
        group: document.getElementById('f-group').value,
        minStock: +document.getElementById('f-minStock').value || 10
      };
      if(editing){ Object.assign(p, d); addAuditLog('Product Updated', name); }
      else { db.products.push(Object.assign({ id: uid('p'), batches: [] }, d)); addAuditLog('Product Added', name); }
      saveDb(); bg.remove(); renderView();
      toast(editing ? '✓ Updated' : '✓ Added');
    });
  }, 50);
}

function openBatchModal(p){
  function renderBatches(){
    if(!p.batches || !p.batches.length) return '<div class="muted">Koi batch nahi.</div>';
    return p.batches.map(function(b, i){
      return '<div class="ledger-row" style="align-items:center;">' +
        '<div style="flex:1;min-width:0;">' +
          '<div><b>B '+esc(b.batch)+'</b></div>' +
          '<div class="muted">Exp: '+fmtDate(b.expiry)+' · '+b.qty+' '+(p.unitLabel||'units')+' · MRP '+money(b.mrp)+'</div>' +
        '</div>' +
        '<button type="button" class="btn xs danger" data-del-batch="'+i+'">×</button>' +
      '</div>';
    }).join('');
  }
  var body =
    '<div class="alert alert-info" style="font-size:12px;">Qty <b>strips/packs</b> mein. Total = Qty × '+p.packSize+'</div>' +
    '<div class="row"><div class="field"><label>Batch # *</label><input id="b-batch"/></div><div class="field"><label>Expiry *</label><input type="date" id="b-expiry"/></div></div>' +
    '<div class="row-3">' +
      '<div class="field"><label>Qty (packs) *</label><input type="number" id="b-qty" value="0" min="0"/></div>' +
      '<div class="field"><label>Retail MRP</label><input type="number" id="b-mrp" value="0" step="any"/></div>' +
      '<div class="field"><label>Cost</label><input type="number" id="b-cost" value="0" step="any"/></div>' +
    '</div>' +
    '<div class="row">' +
      '<div class="field"><label>Wholesale Price</label><input type="number" id="b-wholesale" value="0" step="any"/></div>' +
      (p.packSize > 1 ? '<div class="field"><label>Loose Price / '+esc(p.unitLabel||'unit')+'</label><input type="number" id="b-loosePrice" value="0" step="any"/></div>' : '<div></div>') +
    '</div>' +
    '<div class="divider"></div><h3 style="font-size:13px;">Existing Batches</h3>' +
    '<div id="batch-list">'+renderBatches()+'</div>';
  var bg = openModal('Add Batch — '+p.name, body,
    '<button type="button" class="btn" data-close>Close</button>' +
    '<button type="button" class="btn primary" id="save-batch">Add</button>',
    { wide:true });
  setTimeout(function(){
    function bindDelete(){
      bg.querySelectorAll('[data-del-batch]').forEach(function(btn){
        btn.onclick = function(){
          var i = +btn.dataset.delBatch;
          var b = p.batches[i];
          if(!b) return;
          if(!confirm('Delete batch ' + b.batch + '?')) return;
          p.batches.splice(i, 1);
          addAuditLog('Batch Deleted', p.name + ' · ' + b.batch);
          saveDb();
          document.getElementById('batch-list').innerHTML = renderBatches();
          bindDelete();
          toast('Batch deleted');
        };
      });
    }
    bindDelete();
    var btn = document.getElementById('save-batch');
    if(!btn) return;
    btn.addEventListener('click', function(){
      var batch = document.getElementById('b-batch').value.trim();
      var expiry = document.getElementById('b-expiry').value;
      var packs = parseInt(document.getElementById('b-qty').value) || 0;
      var mrp = parseFloat(document.getElementById('b-mrp').value) || 0;
      var cost = parseFloat(document.getElementById('b-cost').value) || 0;
      var wholesale = parseFloat(document.getElementById('b-wholesale').value) || Math.round(mrp*0.85);
      var lpEl = document.getElementById('b-loosePrice');
      var loosePrice = lpEl ? parseFloat(lpEl.value) || 0 : 0;
      if(!batch || !expiry || packs <= 0){ toast('Fill all fields', 'err'); return; }
      if(!p.batches) p.batches = [];
      p.batches.push({ id:uid('b'), batch:batch, expiry:expiry, qty: packs * p.packSize,
        mrp:mrp, cost:cost, loosePrice:loosePrice, wholesalePrice:wholesale });
      addAuditLog('Batch Added', p.name + ' · ' + batch);
      saveDb();
      document.getElementById('b-batch').value = '';
      document.getElementById('b-expiry').value = '';
      document.getElementById('b-qty').value = '0';
      document.getElementById('b-mrp').value = '0';
      document.getElementById('b-cost').value = '0';
      document.getElementById('b-wholesale').value = '0';
      if(lpEl) lpEl.value = '0';
      document.getElementById('batch-list').innerHTML = renderBatches();
      bindDelete();
      toast('Batch added');
    });
  }, 30);
}

/* ═══════════ CUSTOMERS ═══════════ */
function viewCustomers(){
  var list = db.customers.filter(function(c){ return c.id !== 'c1'; });
  return '<div class="toolbar">' +
    '<button type="button" class="btn active-primary" data-filter-cust="all">All ('+list.length+')</button>' +
    '<button type="button" class="btn" data-filter-cust="retail">Retail ('+list.filter(function(c){ return c.type !== 'wholesale'; }).length+')</button>' +
    '<button type="button" class="btn" data-filter-cust="wholesale">Wholesale ('+list.filter(function(c){ return c.type === 'wholesale'; }).length+')</button>' +
    '<span class="spacer" style="flex:1;"></span>' +
    '<button type="button" class="btn primary" data-action="add-customer">+ Add Customer</button>' +
  '</div>' +
  '<div class="card"><div class="table-wrap" id="cust-wrap">'+custTable(list, 'all')+'</div></div>';
}
function custTable(list, filter){
  if(filter !== 'all'){
    list = list.filter(function(c){
      if(filter === 'wholesale') return c.type === 'wholesale';
      return c.type !== 'wholesale';
    });
  }
  if(!list.length) return '<div class="empty">No customers.</div>';
  var rows = list.map(function(c){
    var bal = ledgerBalance(c.ledger);
    var typeTag = c.type === 'wholesale' ? '<span class="pill purple">Wholesale</span>' : '<span class="pill gray">Retail</span>';
    return '<tr>' +
      '<td><strong>'+esc(c.name)+'</strong> '+typeTag+'</td>' +
      '<td>'+esc(c.phone||'')+'</td>' +
      '<td class="right mono" style="color:'+(bal>0?'var(--danger)':bal<0?'var(--ok)':'var(--muted)')+';font-weight:700;">'+money(Math.abs(bal))+'</td>' +
      '<td class="center">' +
        '<button type="button" class="btn sm" data-action="view-ledger" data-id="'+c.id+'">Ledger</button> ' +
        '<button type="button" class="btn sm" data-action="send-bill" data-id="'+c.id+'">📱 Bill</button> ' +
        '<button type="button" class="btn sm" data-action="edit-customer" data-id="'+c.id+'">Edit</button> ' +
        '<button type="button" class="btn sm" data-action="new-tx" data-id="'+c.id+'">+/-</button> ' +
        '<button type="button" class="btn sm danger" data-action="del-customer" data-id="'+c.id+'">×</button>' +
      '</td></tr>';
  }).join('');
  return '<table><thead><tr><th>Name</th><th>Phone</th><th class="right">Balance</th><th class="center">Actions</th></tr></thead><tbody>'+rows+'</tbody></table>';
}

function openCustomerModal(c){
  var editing = !!c;
  var data = c || { name:'', phone:'', address:'', type:'retail', business:'', ntn:'', cnic:'', email:'', city:'', area:'', creditLimit:0, notes:'' };
  var body =
    '<div class="field"><label>Customer Type *</label>' +
      '<div class="pay-tabs" id="cust-type-tabs">' +
        '<button type="button" data-ctype="retail" class="'+(data.type!=='wholesale'?'active':'')+'">🛒 Retail</button>' +
        '<button type="button" data-ctype="wholesale" class="'+(data.type==='wholesale'?'active':'')+'">🏪 Wholesale</button>' +
      '</div></div>' +
    '<div class="row">' +
      '<div class="field"><label>Full Name *</label><input id="c-name" value="'+esc(data.name||'')+'"/></div>' +
      '<div class="field"><label>Phone / WhatsApp *</label><input id="c-phone" value="'+esc(data.phone||'')+'" placeholder="0300-1234567"/></div>' +
    '</div>' +
    '<div class="row">' +
      '<div class="field"><label>CNIC</label><input id="c-cnic" value="'+esc(data.cnic||'')+'"/></div>' +
      '<div class="field"><label>Email</label><input id="c-email" type="email" value="'+esc(data.email||'')+'"/></div>' +
    '</div>' +
    '<div id="c-ws-fields" style="display:'+(data.type==='wholesale'?'block':'none')+';">' +
      '<div class="row">' +
        '<div class="field"><label>Business Name *</label><input id="c-business" value="'+esc(data.business||'')+'"/></div>' +
        '<div class="field"><label>NTN</label><input id="c-ntn" value="'+esc(data.ntn||'')+'"/></div>' +
      '</div>' +
      '<div class="field"><label>Credit Limit ('+esc(db.settings.currency)+')</label>' +
        '<input type="number" id="c-creditLimit" value="'+(data.creditLimit||0)+'" step="any" placeholder="0 = unlimited"/></div>' +
    '</div>' +
    '<div class="field"><label>Address</label><input id="c-address" value="'+esc(data.address||'')+'"/></div>' +
    '<div class="row">' +
      '<div class="field"><label>City</label><input id="c-city" value="'+esc(data.city||'')+'"/></div>' +
      '<div class="field"><label>Area</label><input id="c-area" value="'+esc(data.area||'')+'"/></div>' +
    '</div>' +
    '<div class="field"><label>Notes</label><textarea id="c-notes" rows="2">'+esc(data.notes||'')+'</textarea></div>';

  var bg = openModal(editing ? '✏ Edit Customer' : '➕ Add Customer', body,
    '<button type="button" class="btn" data-close>Cancel</button>' +
    '<button type="button" class="btn primary" id="save-customer">💾 Save</button>',
    { wide:true });

  var custType = data.type || 'retail';
  setTimeout(function(){
    var tabs = document.getElementById('cust-type-tabs');
    if(tabs){
      tabs.addEventListener('click', function(e){
        var btn = e.target.closest('[data-ctype]');
        if(!btn) return;
        custType = btn.dataset.ctype;
        $$('#cust-type-tabs button').forEach(function(x){ x.classList.remove('active'); });
        btn.classList.add('active');
        document.getElementById('c-ws-fields').style.display = custType === 'wholesale' ? 'block' : 'none';
      });
    }
    var btn = document.getElementById('save-customer');
    if(!btn) return;
    btn.addEventListener('click', function(){
      var name = document.getElementById('c-name').value.trim();
      if(!name){ toast('Name required', 'err'); return; }
      var phone = document.getElementById('c-phone').value.trim();
      if(!phone){ toast('Phone required', 'err'); return; }
      var business = '', ntn = '', creditLimit = 0;
      if(custType === 'wholesale'){
        business = document.getElementById('c-business').value.trim();
        ntn = document.getElementById('c-ntn').value.trim();
        creditLimit = +document.getElementById('c-creditLimit').value || 0;
        if(!business){ toast('Business name zaroori', 'err'); return; }
      }
      var d = {
        name: name, type: custType, phone: phone,
        cnic: document.getElementById('c-cnic').value.trim(),
        email: document.getElementById('c-email').value.trim(),
        business: business, ntn: ntn, creditLimit: creditLimit,
        address: document.getElementById('c-address').value.trim(),
        city: document.getElementById('c-city').value.trim(),
        area: document.getElementById('c-area').value.trim(),
        notes: document.getElementById('c-notes').value.trim()
      };
      if(editing) Object.assign(c, d);
      else db.customers.push(Object.assign({ id:uid('c'), ledger:[], points:0 }, d));
      addAuditLog(editing ? 'Customer Updated' : 'Customer Added', name);
      saveDb(); bg.remove(); renderView();
      toast(editing ? '✓ Updated' : '✓ Added');
    });
  }, 30);
}

function openLedgerModal(c){
  var rows = (c.ledger||[]).slice().reverse();
  var bal = ledgerBalance(c.ledger);
  var body = '<div class="flex" style="justify-content:space-between;margin-bottom:14px;">' +
    '<div><div class="muted" style="font-size:11px;">Balance</div>' +
    '<strong style="font-size:18px;color:'+(bal>0?'var(--danger)':bal<0?'var(--ok)':'var(--muted)')+';">'+money(Math.abs(bal))+'</strong></div>' +
    '<div style="display:flex;gap:6px;">' +
      (c.phone ? '<button type="button" class="btn sm" data-action="send-bill" data-id="'+c.id+'">📱 Send Bill</button>' : '') +
      '<button type="button" class="btn sm primary" data-action="new-tx" data-id="'+c.id+'">New Tx</button>' +
    '</div>' +
  '</div>' +
  (rows.length ? rows.map(function(e){
    var isCredit = e.type === 'sale' || e.type === 'credit' || e.type === 'purchase';
    return '<div class="ledger-row"><div><div><b>'+esc(e.note||e.type)+'</b></div><div class="muted">'+fmtDateTime(e.date)+'</div></div>' +
      '<div style="color:'+(isCredit?'var(--danger)':'var(--ok)')+';font-weight:700;">'+(isCredit?'+':'−')+' '+money(e.amount)+'</div></div>';
  }).join('') : '<div class="empty">No entries.</div>');
  openModal('Ledger — '+c.name, body, '<button type="button" class="btn" data-close>Close</button>', { wide:true });
}

function openTransactionModal(c){
  var body =
    '<div class="field"><label>Customer</label><input value="'+esc(c.name)+'" readonly/></div>' +
    '<div class="muted" style="margin-bottom:12px;">Balance: <b>'+money(ledgerBalance(c.ledger))+'</b></div>' +
    '<div class="pay-tabs" id="tx-tabs">' +
      '<button type="button" data-txtype="credit" class="active">Credit (Udhaar)</button>' +
      '<button type="button" data-txtype="debit">Payment Received</button>' +
    '</div>' +
    '<div class="field"><label>Amount *</label><input type="number" id="tx-amt" step="any"/></div>' +
    '<div class="field"><label>Note</label><input id="tx-note"/></div>';
  var bg = openModal('Transaction', body,
    '<button type="button" class="btn" data-close>Cancel</button>' +
    '<button type="button" class="btn primary" id="tx-save">Save</button>');
  var txType = 'credit';
  setTimeout(function(){
    var tabs = document.getElementById('tx-tabs');
    if(tabs){
      tabs.addEventListener('click', function(e){
        var b = e.target.closest('[data-txtype]');
        if(!b) return;
        txType = b.dataset.txtype;
        $$('#tx-tabs button').forEach(function(x){ x.classList.remove('active'); });
        b.classList.add('active');
      });
    }
    var btn = document.getElementById('tx-save');
    if(!btn) return;
    btn.addEventListener('click', function(){
      var amt = parseFloat(document.getElementById('tx-amt').value) || 0;
      if(amt <= 0){ toast('Amount required', 'err'); return; }
      if(!c.ledger) c.ledger = [];
      c.ledger.push({ id:uid('l'), date:new Date().toISOString(),
        type:txType === 'credit' ? 'credit' : 'payment', amount:amt,
        note:document.getElementById('tx-note').value.trim() || (txType === 'credit' ? 'Udhaar' : 'Payment') });
      saveDb(); bg.remove(); renderView();
      toast((txType === 'credit' ? 'Credit' : 'Payment')+' recorded');
    });
  }, 30);
}

/* ═══════════ SUPPLIERS ═══════════ */
function viewSuppliers(){
  return '<div class="toolbar"><button type="button" class="btn primary" data-action="add-supplier">+ Add Supplier</button></div>' +
    '<div class="card"><div class="table-wrap"><table><thead><tr><th>Supplier</th><th>Companies</th><th>Phone</th><th class="right">Payable</th><th class="center">Actions</th></tr></thead><tbody>' +
    (db.suppliers.length ? db.suppliers.map(function(s){
      var bal = ledgerBalance(s.ledger);
      var compTags = (s.companies||[]).length ? (s.companies||[]).map(function(c){ return '<span class="pill purple" style="margin:2px;">'+esc(c)+'</span>'; }).join('') : '<span class="muted">—</span>';
      return '<tr><td><strong>'+esc(s.name)+'</strong></td><td>'+compTags+'</td><td>'+esc(s.phone||'')+'</td>' +
        '<td class="right mono" style="color:'+(bal>0?'var(--danger)':'var(--ok)')+';font-weight:700;">'+money(bal)+'</td>' +
        '<td class="center">' +
          '<button type="button" class="btn sm" data-action="view-supplier-ledger" data-id="'+s.id+'">Ledger</button> ' +
          '<button type="button" class="btn sm" data-action="supplier-pay" data-id="'+s.id+'">Pay</button> ' +
          '<button type="button" class="btn sm" data-action="edit-supplier" data-id="'+s.id+'">Edit</button> ' +
          '<button type="button" class="btn sm danger" data-action="del-supplier" data-id="'+s.id+'">×</button>' +
        '</td></tr>';
    }).join('') : '<tr><td colspan="5" class="empty">No suppliers.</td></tr>') +
    '</tbody></table></div></div>';
}
function openSupplierModal(s){
  var editing = !!s;
  var data = s || { name:'', phone:'', address:'', email:'', contactPerson:'', companies:[] };
  var companiesStr = (data.companies || []).join(', ');
  var body =
    '<div class="field"><label>Supplier Name *</label><input id="s-name" value="'+esc(data.name||'')+'"/></div>' +
    '<div class="field"><label>Companies (comma-separated)</label><input id="s-companies" value="'+esc(companiesStr)+'" placeholder="GSK, Abbott, Sanofi"/></div>' +
    '<div class="row">' +
      '<div class="field"><label>Phone</label><input id="s-phone" value="'+esc(data.phone||'')+'"/></div>' +
      '<div class="field"><label>Email</label><input id="s-email" type="email" value="'+esc(data.email||'')+'"/></div>' +
    '</div>' +
    '<div class="field"><label>Contact Person</label><input id="s-contact" value="'+esc(data.contactPerson||'')+'"/></div>' +
    '<div class="field"><label>Address</label><input id="s-address" value="'+esc(data.address||'')+'"/></div>';
  var bg = openModal(editing ? 'Edit Supplier' : 'Add Supplier', body,
    '<button type="button" class="btn" data-close>Cancel</button>' +
    '<button type="button" class="btn primary" id="save-supplier">Save</button>',
    { wide:true });
  setTimeout(function(){
    var btn = document.getElementById('save-supplier');
    if(!btn) return;
    btn.addEventListener('click', function(){
      var name = document.getElementById('s-name').value.trim();
      if(!name){ toast('Name required', 'err'); return; }
      var companiesRaw = document.getElementById('s-companies').value.trim();
      var companies = companiesRaw ? companiesRaw.split(',').map(function(c){ return c.trim(); }).filter(function(c){ return c; }) : [];
      var d = {
        name: name,
        phone: document.getElementById('s-phone').value.trim(),
        email: document.getElementById('s-email').value.trim(),
        contactPerson: document.getElementById('s-contact').value.trim(),
        address: document.getElementById('s-address').value.trim(),
        companies: companies
      };
      if(editing) Object.assign(s, d);
      else db.suppliers.push(Object.assign({ id:uid('s'), ledger:[] }, d));
      saveDb(); bg.remove(); renderView();
      toast('Saved');
    });
  }, 30);
}
function openSupplierLedger(s){
  var rows = (s.ledger||[]).slice().reverse();
  var bal = ledgerBalance(s.ledger);
  var body = '<div class="flex" style="justify-content:space-between;margin-bottom:14px;">' +
    '<strong>Payable</strong><span class="mono" style="color:'+(bal>0?'var(--danger)':'var(--ok)')+';font-size:17px;font-weight:800;">'+money(bal)+'</span></div>' +
    (rows.length ? rows.map(function(e){
      return '<div class="ledger-row"><div><div>'+esc(e.note||e.type)+'</div><div class="muted">'+fmtDate(e.date)+'</div></div>' +
        '<div style="color:'+(e.type==='purchase'?'var(--danger)':'var(--ok)')+';font-weight:700;">'+(e.type==='purchase'?'+':'−')+' '+money(e.amount)+'</div></div>';
    }).join('') : '<div class="empty">No entries.</div>');
  openModal('Ledger — '+s.name, body, '<button type="button" class="btn" data-close>Close</button>');
}
function openSupplierPay(s){
  var body = '<div class="field"><label>Amount *</label><input type="number" id="sp-amt" step="any"/></div>' +
    '<div class="field"><label>Note</label><input id="sp-note"/></div>';
  var bg = openModal('Pay Supplier — '+s.name, body,
    '<button type="button" class="btn" data-close>Cancel</button>' +
    '<button type="button" class="btn primary" id="save-sp">Save</button>');
  setTimeout(function(){
    var btn = document.getElementById('save-sp');
    if(!btn) return;
    btn.addEventListener('click', function(){
      var amt = +document.getElementById('sp-amt').value;
      if(!amt || amt <= 0){ toast('Invalid amount', 'err'); return; }
      s.ledger = s.ledger || [];
      s.ledger.push({ id:uid('l'), date:new Date().toISOString(), type:'payment', amount:amt, note:document.getElementById('sp-note').value.trim() || 'Paid' });
      addAuditLog('Supplier Payment', s.name + ' · ' + money(amt));
      saveDb(); bg.remove(); renderView();
      toast('Payment saved');
    });
  }, 30);
}

/* ═══════════ PURCHASES ═══════════ */
function viewPurchases(){
  var list = (db.purchases||[]).slice().reverse();
  return '<div class="toolbar"><button type="button" class="btn primary" data-action="add-purchase">+ New Purchase</button></div>' +
    '<div class="card">' +
      (list.length
        ? '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Supplier</th><th>Invoice</th><th>Items</th><th class="right">Total</th><th>Status</th></tr></thead><tbody>' +
          list.map(function(p){
            return '<tr><td>'+fmtDate(p.date)+'</td><td>'+esc(p.supplierName)+'</td>' +
              '<td class="mono">'+esc(p.invoiceNo||'—')+'</td>' +
              '<td>'+(p.items||[]).length+' items</td>' +
              '<td class="right mono">'+money(p.total)+'</td>' +
              '<td><span class="pill '+(p.paid?'ok':'warn')+'">'+(p.paid?'Paid':'Credit')+'</span></td></tr>';
          }).join('') + '</tbody></table></div>'
        : '<div class="empty">No purchases yet.</div>') +
    '</div>';
}
function openPurchaseModal(){
  if(!db.suppliers.length){ toast('Pehle supplier add karein', 'err'); return; }
  if(!db.products.length){ toast('Pehle product add karein', 'err'); return; }
  var purchaseItems = [];
  function renderItemsList(){
    if(!purchaseItems.length) return '<div class="muted" style="text-align:center;padding:14px;">Koi item nahi.</div>';
    return purchaseItems.map(function(it, i){
      return '<div style="display:flex;justify-content:space-between;align-items:center;background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:8px 12px;margin-bottom:6px;">' +
        '<div style="flex:1;min-width:0;"><div><b>'+esc(it.name)+'</b></div>' +
          '<div class="muted">B '+esc(it.batch)+' · Exp '+fmtDate(it.expiry)+' · '+it.packs+' packs @ '+money(it.cost)+'</div></div>' +
        '<div class="mono" style="margin-right:8px;">'+money(it.packs*it.cost)+'</div>' +
        '<button type="button" class="btn xs danger" data-rm-pitem="'+i+'">×</button>' +
      '</div>';
    }).join('');
  }
  var body =
    '<div class="row">' +
      '<div class="field"><label>Supplier *</label><select id="pu-supplier">' +
        db.suppliers.map(function(s){ return '<option value="'+s.id+'">'+esc(s.name)+'</option>'; }).join('') +
      '</select></div>' +
      '<div class="field"><label>Invoice #</label><input id="pu-invoice"/></div>' +
    '</div>' +
    '<div class="row">' +
      '<div class="field"><label>Product *</label><select id="pu-product">' +
        db.products.map(function(p){ return '<option value="'+p.id+'">'+esc(p.name)+'</option>'; }).join('') +
      '</select></div>' +
      '<div class="field"><label>Batch # *</label><input id="pu-batch"/></div>' +
    '</div>' +
    '<div class="row-3">' +
      '<div class="field"><label>Expiry *</label><input type="date" id="pu-expiry"/></div>' +
      '<div class="field"><label>Qty (packs) *</label><input type="number" id="pu-qty" value="1" min="1"/></div>' +
      '<div class="field"><label>Cost / pack</label><input type="number" id="pu-cost" value="0" step="any"/></div>' +
    '</div>' +
    '<div class="row">' +
      '<div class="field"><label>Retail MRP</label><input type="number" id="pu-mrp" value="0" step="any"/></div>' +
      '<div class="field"><label>Wholesale</label><input type="number" id="pu-ws" value="0" step="any"/></div>' +
    '</div>' +
    '<div class="row">' +
      '<div class="field"><label>Loose Price</label><input type="number" id="pu-loose" value="0" step="any"/></div>' +
      '<div class="field"><label>Payment</label><select id="pu-paid"><option value="1">Paid</option><option value="0">Credit</option></select></div>' +
    '</div>' +
    '<button type="button" class="btn primary block" id="pu-add-item" style="margin-top:6px;">+ Add Item</button>' +
    '<div class="divider"></div>' +
    '<h3 style="font-size:13px;">Items in this Purchase</h3>' +
    '<div id="pu-items-list">'+renderItemsList()+'</div>' +
    '<div class="divider"></div>' +
    '<div style="display:flex;justify-content:space-between;font-weight:800;font-size:16px;">' +
      '<span>Total</span><span id="pu-total" class="mono">'+money(0)+'</span></div>';
  var bg = openModal('New Purchase', body,
    '<button type="button" class="btn" data-close>Cancel</button>' +
    '<button type="button" class="btn primary" id="save-purchase">Save</button>',
    { wide:true });
  function refreshList(){
    document.getElementById('pu-items-list').innerHTML = renderItemsList();
    var total = purchaseItems.reduce(function(a,x){ return a + x.packs*x.cost; }, 0);
    document.getElementById('pu-total').textContent = money(total);
    bg.querySelectorAll('[data-rm-pitem]').forEach(function(btn){
      btn.onclick = function(){ purchaseItems.splice(+btn.dataset.rmPitem, 1); refreshList(); };
    });
  }
  setTimeout(function(){
    var addBtn = document.getElementById('pu-add-item');
    if(addBtn) addBtn.addEventListener('click', function(){
      var pid = document.getElementById('pu-product').value;
      var batch = document.getElementById('pu-batch').value.trim();
      var expiry = document.getElementById('pu-expiry').value;
      var packs = +document.getElementById('pu-qty').value || 0;
      var cost = +document.getElementById('pu-cost').value || 0;
      var mrp = +document.getElementById('pu-mrp').value || 0;
      var wsPrice = +document.getElementById('pu-ws').value || Math.round(mrp*0.85);
      var loosePrice = +document.getElementById('pu-loose').value || 0;
      if(!batch || !expiry || packs <= 0){ toast('Fill batch, expiry, qty', 'err'); return; }
      var p = findProduct(pid);
      if(!p) return;
      purchaseItems.push({ productId: pid, name: p.name, packSize: p.packSize,
        batch: batch, expiry: expiry, packs: packs, cost: cost, mrp: mrp, wholesalePrice: wsPrice, loosePrice: loosePrice });
      document.getElementById('pu-batch').value = '';
      document.getElementById('pu-expiry').value = '';
      document.getElementById('pu-qty').value = '1';
      document.getElementById('pu-cost').value = '0';
      document.getElementById('pu-mrp').value = '0';
      document.getElementById('pu-ws').value = '0';
      document.getElementById('pu-loose').value = '0';
      refreshList();
      toast('Item added');
    });
    var saveBtn = document.getElementById('save-purchase');
    if(saveBtn) saveBtn.addEventListener('click', function(){
      if(!purchaseItems.length){ toast('Add at least 1 item', 'err'); return; }
      var sid = document.getElementById('pu-supplier').value;
      var paid = document.getElementById('pu-paid').value === '1';
      var s = findSupplier(sid);
      if(!s){ toast('Supplier not found', 'err'); return; }
      var total = 0;
      purchaseItems.forEach(function(it){
        var p = findProduct(it.productId);
        if(!p) return;
        if(!p.batches) p.batches = [];
        p.batches.push({ id:uid('b'), batch:it.batch, expiry:it.expiry,
          qty: it.packs * p.packSize, mrp:it.mrp, cost:it.cost,
          loosePrice:it.loosePrice, wholesalePrice:it.wholesalePrice });
        total += it.packs * it.cost;
      });
      db.purchases.push({ id:uid('pur'), date:new Date().toISOString(),
        supplierId:sid, supplierName:s.name,
        invoiceNo:document.getElementById('pu-invoice').value.trim(),
        items: purchaseItems.slice(), total: total, paid: paid });
      if(!paid){
        s.ledger = s.ledger || [];
        s.ledger.push({ id:uid('l'), date:new Date().toISOString(), type:'purchase', amount:total,
          note: 'Purchase ' + (document.getElementById('pu-invoice').value.trim()||'') });
      }
      addAuditLog('Purchase Added', s.name + ' · ' + purchaseItems.length + ' items · ' + money(total));
      saveDb(); bg.remove(); renderView();
      toast('Purchase saved');
    });
  }, 30);
}

/* ═══════════ PURCHASE ORDERS ═══════════ */
function viewPurchaseOrders(){
  var list = (db.purchaseOrders || []).slice().reverse();
  if(!list.length){
    return '<div class="toolbar"><button type="button" class="btn primary" data-action="place-order">➕ Place Order</button></div>' +
      '<div class="card"><div class="empty">📭 Abhi koi PO nahi.</div></div>';
  }
  var rows = list.map(function(po){
    var cls = po.status === 'received' ? 'ok' : po.status === 'cancelled' ? 'red' : po.status === 'sent' ? 'blue' : 'warn';
    var actions = '';
    if(po.status === 'pending'){
      actions = '<button type="button" class="btn xs" data-action="po-mark-sent" data-id="'+po.id+'">Sent</button> ' +
                '<button type="button" class="btn xs primary" data-action="po-receive" data-id="'+po.id+'">✓ Receive</button>';
    } else if(po.status === 'sent'){
      actions = '<button type="button" class="btn xs primary" data-action="po-receive" data-id="'+po.id+'">✓ Receive</button>';
    }
    actions += ' <button type="button" class="btn xs" data-action="po-view" data-id="'+po.id+'">View</button>';
    if(po.status !== 'received'){
      actions += ' <button type="button" class="btn xs danger" data-action="po-cancel" data-id="'+po.id+'">×</button>';
    }
    return '<tr><td class="mono"><b>'+esc(po.poNumber)+'</b></td><td>'+fmtDate(po.date)+'</td>' +
      '<td><strong>'+esc(po.supplierName)+'</strong></td><td>'+(po.items||[]).length+' items</td>' +
      '<td class="right mono"><b>'+money(po.total)+'</b></td>' +
      '<td><span class="pill '+cls+'">'+esc(po.status.toUpperCase())+'</span></td>' +
      '<td class="center">'+actions+'</td></tr>';
  }).join('');
  return '<div class="toolbar"><button type="button" class="btn primary" data-action="place-order">➕ Place Order</button>' +
    '<button type="button" class="btn" data-nav="reorder">🔄 Smart Reorder</button></div>' +
    '<div class="card"><h3>📋 All Purchase Orders</h3>' +
    '<div class="table-wrap"><table><thead><tr><th>PO #</th><th>Date</th><th>Supplier</th><th>Items</th><th class="right">Total</th><th>Status</th><th class="center">Actions</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>';
}
function openPOViewModal(poId){
  var po = (db.purchaseOrders || []).find(function(p){ return p.id === poId; });
  if(!po){ toast('PO not found', 'err'); return; }
  var cls = po.status === 'received' ? 'ok' : (po.status === 'cancelled' ? 'red' : (po.status === 'sent' ? 'blue' : 'warn'));
  var itemsHtml = (po.items || []).map(function(it, i){
    return '<div class="ledger-row"><div><div><b>'+(i+1)+'. '+esc(it.description || it.name || 'Item')+'</b></div>' +
      '<div class="muted">Qty: '+it.qty+' × '+money(it.unitPrice)+' = <b>'+money(it.qty*it.unitPrice)+'</b></div></div></div>';
  }).join('');
  var body = '<div class="grid cols-2" style="margin-bottom:14px;">' +
      '<div><div class="muted">PO #</div><b class="mono">'+esc(po.poNumber)+'</b></div>' +
      '<div><div class="muted">Status</div><span class="pill '+cls+'">'+esc(po.status.toUpperCase())+'</span></div>' +
      '<div><div class="muted">Date</div><b>'+fmtDate(po.date)+'</b></div>' +
      '<div><div class="muted">Supplier</div><b>'+esc(po.supplierName)+'</b></div>' +
    '</div><div class="divider"></div>' +
    '<h3 style="font-size:13px;margin-bottom:8px;">📦 Items ('+(po.items||[]).length+')</h3>' + itemsHtml +
    '<div class="divider"></div>' +
    '<div class="totals"><div class="tot-row big"><span class="l">TOTAL</span><span class="mono">'+money(po.total)+'</span></div></div>';
  var foot = '<button type="button" class="btn" data-close>Close</button>';
  if(po.status !== 'received' && po.status !== 'cancelled'){
    foot = '<button type="button" class="btn primary" id="po-view-receive">✓ Receive</button>' + foot;
  }
  var bg = openModal('PO — '+po.poNumber, body, foot, { wide:true });
  setTimeout(function(){
    var rbtn = document.getElementById('po-view-receive');
    if(rbtn) rbtn.addEventListener('click', function(){ bg.remove(); receivePO(po.id); });
  }, 30);
}
function savePORecord(items, supplier, sentVia, notes){
  if(!db.purchaseOrders) db.purchaseOrders = [];
  var subtotal = items.reduce(function(a,x){ return a + x.qty * x.unitPrice; }, 0);
  var taxRate = db.settings.taxEnabled ? (db.settings.taxRate || 0) : 0;
  var taxAmount = subtotal * taxRate / 100;
  var total = subtotal + taxAmount;
  var po = {
    id: uid('po'), poNumber: nextPONumber(), date: new Date().toISOString(),
    supplierId: supplier ? supplier.id : null,
    supplierName: supplier ? supplier.name : 'Unknown',
    supplierPhone: supplier ? (supplier.phone || '') : '',
    items: JSON.parse(JSON.stringify(items)),
    subtotal: subtotal, taxRate: taxRate, taxAmount: taxAmount, total: total,
    status: 'pending', sentVia: sentVia || 'manual',
    notes: notes || '', user: currentUserData ? currentUserData.name : 'system'
  };
  db.purchaseOrders.push(po);
  addAuditLog('PO Created', po.poNumber + ' · ' + po.supplierName + ' · ' + money(total));
  saveDb();
  return po;
}
function receivePO(poId){
  var po = (db.purchaseOrders || []).find(function(p){ return p.id === poId; });
  if(!po){ toast('PO not found', 'err'); return; }
  if(po.status === 'received'){ toast('Already received', 'warn'); return; }
  var itemsListHtml = po.items.map(function(it, i){
    var typeTag = (it.isCustom || !it.productId) ? '<span class="pill purple" style="font-size:9px;">NEW</span>' : '';
    return '<div class="ledger-row"><div><div><b>'+(i+1)+'. '+esc(it.description||it.name)+'</b> '+typeTag+'</div>' +
      '<div class="muted">Qty: '+it.qty+' × '+money(it.unitPrice||0)+'</div></div></div>';
  }).join('');
  var body = '<div class="alert alert-ok"><b>📦 '+esc(po.poNumber)+'</b> · '+esc(po.supplierName)+'</div>' +
    '<h3 style="font-size:13px;margin-bottom:10px;">📋 Items</h3>' + itemsListHtml +
    '<div class="divider"></div>' +
    '<div class="pay-tabs" id="receive-pay-tabs">' +
      '<button type="button" data-receive-pay="paid" class="active">✓ Paid</button>' +
      '<button type="button" data-receive-pay="credit">📝 Credit</button>' +
    '</div>' +
    '<div class="field"><label>Bill/Invoice #</label><input id="receive-bill-no"/></div>' +
    '<div class="row">' +
      '<div class="field"><label>Bill Amount</label><input type="number" id="receive-bill-amt" value="'+po.total.toFixed(2)+'" step="any"/></div>' +
      '<div class="field"><label>Payment Mode</label><select id="receive-pay-mode"><option>Cash</option><option>Bank</option><option>Cheque</option><option>Online</option></select></div>' +
    '</div>' +
    '<div class="field"><label>Payment Date</label><input type="date" id="receive-paid-date" value="'+todayISO()+'"/></div>';
  var bg = openModal('📦 Receive PO — '+po.poNumber, body,
    '<button type="button" class="btn" data-close>Cancel</button>' +
    '<button type="button" class="btn primary" id="receive-confirm-btn">✓ Confirm</button>',
    { wide:true });
  setTimeout(function(){
    var payType = 'paid';
    var tabs = document.getElementById('receive-pay-tabs');
    if(tabs) tabs.addEventListener('click', function(e){
      var btn = e.target.closest('[data-receive-pay]');
      if(!btn) return;
      payType = btn.dataset.receivePay;
      $$('#receive-pay-tabs button').forEach(function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
    });
    var btn = document.getElementById('receive-confirm-btn');
    if(!btn) return;
    btn.addEventListener('click', function(){
      var billNo = document.getElementById('receive-bill-no').value.trim();
      var billAmt = +document.getElementById('receive-bill-amt').value || 0;
      var payMode = document.getElementById('receive-pay-mode').value;
      var paidDate = document.getElementById('receive-paid-date').value || todayISO();
      var added = 0, newProducts = 0;
      po.items.forEach(function(it){
        if(it.isCustom || !it.productId){
          var prodName = String(it.description || it.name || 'New').split(' — ')[0].split('(')[0].trim();
          if(!prodName) prodName = 'Item ' + Date.now().toString().slice(-4);
          var existing = db.products.find(function(p){ return p.name.toLowerCase() === prodName.toLowerCase(); });
          if(existing){
            if(!existing.batches) existing.batches = [];
            existing.batches.push({ id: uid('b'), batch: 'PO-' + po.poNumber.replace(/[^A-Z0-9-]/gi,''),
              expiry: new Date(Date.now() + 365*2*86400000).toISOString().slice(0,10),
              qty: it.qty, mrp: (it.unitPrice || 0) * 1.4, cost: it.unitPrice || 0,
              loosePrice: 0, wholesalePrice: Math.round((it.unitPrice || 0) * 1.4 * 0.85) });
            added++;
          } else {
            db.products.push({ id: uid('p'), name: prodName, company: po.supplierName || '',
              barcode: generateAutoBarcode(), generic: '', packing: '', category: 'Tablet', group: 'Other',
              minStock: 10, packSize: 1, unitLabel: 'pc',
              batches: [{ id: uid('b'), batch: 'PO-' + po.poNumber.replace(/[^A-Z0-9-]/gi,''),
                expiry: new Date(Date.now() + 365*2*86400000).toISOString().slice(0,10),
                qty: it.qty, mrp: (it.unitPrice || 0) * 1.4, cost: it.unitPrice || 0,
                loosePrice: 0, wholesalePrice: Math.round((it.unitPrice || 0) * 1.4 * 0.85) }] });
            newProducts++; added++;
          }
          return;
        }
        var p = findProduct(it.productId);
        if(!p) return;
        if(!p.batches) p.batches = [];
        p.batches.push({ id: uid('b'), batch: 'PO-' + po.poNumber.replace(/[^A-Z0-9-]/gi,''),
          expiry: new Date(Date.now() + 365*2*86400000).toISOString().slice(0,10),
          qty: it.qty * (it.packSize || p.packSize || 1),
          mrp: it.unitPrice * 1.4, cost: it.unitPrice,
          loosePrice: p.packSize > 1 ? Math.ceil(it.unitPrice * 1.4 / p.packSize * 1.2) : 0,
          wholesalePrice: Math.round(it.unitPrice * 1.4 * 0.85) });
        added++;
      });
      var supplier = findSupplier(po.supplierId);
      if(!db.purchases) db.purchases = [];
      db.purchases.push({ id: uid('pur'),
        date: paidDate + 'T' + new Date().toTimeString().slice(0,8),
        supplierId: po.supplierId, supplierName: po.supplierName,
        invoiceNo: billNo || po.poNumber, poNumber: po.poNumber,
        items: po.items.slice(), total: billAmt, paid: payType === 'paid',
        payMode: payMode, paymentDate: paidDate, source: 'PO-RECEIVED' });
      if(supplier){
        supplier.ledger = supplier.ledger || [];
        if(payType === 'credit'){
          supplier.ledger.push({ id: uid('l'), date: new Date().toISOString(), type: 'purchase', amount: billAmt, note: 'Purchase ' + (billNo || po.poNumber) + ' (Credit)' });
        } else {
          supplier.ledger.push({ id: uid('l'), date: paidDate + 'T' + new Date().toTimeString().slice(0,8), type: 'purchase', amount: billAmt, note: 'Purchase ' + (billNo || po.poNumber) });
          supplier.ledger.push({ id: uid('l'), date: paidDate + 'T' + new Date().toTimeString().slice(0,8), type: 'payment', amount: billAmt, note: 'Paid via ' + payMode });
        }
      }
      po.status = 'received';
      po.receivedAt = new Date().toISOString();
      po.billNo = billNo; po.billAmount = billAmt;
      po.payType = payType; po.payMode = payMode;
      addAuditLog('PO Received', po.poNumber + ' · ' + added + ' items · ' + (payType === 'paid' ? 'PAID' : 'CREDIT'));
      saveDb(); bg.remove(); renderView();
      toast('✓ PO Received! ' + added + ' items added');
    });
  }, 40);
}
function openPlaceOrderModal(){
  if(!db.suppliers.length){ toast('Pehle supplier add karein', 'err'); return; }
  var orderItems = [];
  function renderItemsList(){
    if(!orderItems.length) return '<div class="muted" style="text-align:center;padding:14px;">Koi item nahi.</div>';
    return orderItems.map(function(it, i){
      var typeTag = it.isCustom ? ' <span class="pill purple" style="font-size:9px;">NEW</span>' : '';
      return '<div style="display:flex;justify-content:space-between;align-items:center;background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:8px 12px;margin-bottom:6px;">' +
        '<div style="flex:1;min-width:0;"><div><b>'+esc(it.description)+'</b>'+typeTag+'</div>' +
          '<div class="muted">Qty: '+it.qty+(it.unitPrice?' × '+money(it.unitPrice):'')+'</div></div>' +
        '<button type="button" class="btn xs danger" data-rm-item="'+i+'">×</button>' +
      '</div>';
    }).join('');
  }
  function refreshList(){
    var el = document.getElementById('po-place-items-list');
    if(el) el.innerHTML = renderItemsList();
    document.querySelectorAll('#po-place-items-list [data-rm-item]').forEach(function(btn){
      btn.onclick = function(){ orderItems.splice(+btn.dataset.rmItem, 1); refreshList(); };
    });
  }
  var body = '<div class="field"><label>🏪 Supplier *</label>' +
      '<select id="po-place-supplier">'+db.suppliers.map(function(s){ return '<option value="'+s.id+'">'+esc(s.name)+'</option>'; }).join('')+'</select>' +
    '</div>' +
    '<div class="field"><label>🔍 Inventory se select (optional)</label>' +
      '<select id="po-place-product"><option value="">— Select —</option>' + db.products.map(function(p){ return '<option value="'+p.id+'">'+esc(p.name)+'</option>'; }).join('') + '</select>' +
    '</div>' +
    '<div class="field"><label>Item Name *</label><input id="po-place-name" placeholder="e.g. Panadol 500mg"/></div>' +
    '<div class="row">' +
      '<div class="field"><label>Quantity *</label><input type="number" id="po-place-qty" value="10" min="1"/></div>' +
      '<div class="field"><label>Unit Price</label><input type="number" id="po-place-price" value="0" step="any"/></div>' +
    '</div>' +
    '<button type="button" class="btn primary block" id="po-place-add">+ Add Item</button>' +
    '<div class="divider"></div>' +
    '<div id="po-place-items-list">'+renderItemsList()+'</div>';
  var bg = openModal('📝 Place Order', body,
    '<button type="button" class="btn" data-close>Cancel</button>' +
    '<button type="button" class="btn" id="po-place-wa">📱 WhatsApp</button>' +
    '<button type="button" class="btn primary" id="po-place-print">🖨 Print</button>',
    { wide:true });
  window.__poPlaceItems = orderItems;
  setTimeout(function(){
    var productSel = document.getElementById('po-place-product');
    var nameInput = document.getElementById('po-place-name');
    var priceInput = document.getElementById('po-place-price');
    if(productSel) productSel.addEventListener('change', function(){
      var pid = productSel.value;
      if(!pid) return;
      var p = findProduct(pid);
      if(!p) return;
      var b = (p.batches||[])[0];
      nameInput.value = p.name + (p.packing ? ' — ' + p.packing : '');
      if(b && b.cost) priceInput.value = b.cost;
    });
    var addBtn = document.getElementById('po-place-add');
    if(addBtn) addBtn.addEventListener('click', function(){
      var pid = productSel ? productSel.value : '';
      var name = nameInput ? nameInput.value.trim() : '';
      var qty = +document.getElementById('po-place-qty').value || 0;
      var price = +document.getElementById('po-place-price').value || 0;
      if(!name){ toast('Item name required', 'err'); return; }
      if(qty <= 0){ toast('Quantity required', 'err'); return; }
      var p = pid ? findProduct(pid) : null;
      orderItems.push({ productId: pid || null, name: p ? p.name : name, description: name,
        qty: qty, unitPrice: price, packSize: p ? p.packSize : 1, isCustom: !p });
      if(productSel) productSel.value = '';
      nameInput.value = '';
      document.getElementById('po-place-qty').value = '10';
      priceInput.value = '0';
      refreshList();
      toast('✓ Item added');
    });
    var waBtn = document.getElementById('po-place-wa');
    if(waBtn) waBtn.addEventListener('click', function(){ placeOrderSend('whatsapp'); });
    var printBtn = document.getElementById('po-place-print');
    if(printBtn) printBtn.addEventListener('click', function(){ placeOrderSend('print'); });
    refreshList();
  }, 50);
}
function placeOrderSend(method){
  var items = window.__poPlaceItems || [];
  if(!items.length){ toast('Add at least 1 item', 'err'); return; }
  var supSel = document.getElementById('po-place-supplier');
  var supplier = supSel ? findSupplier(supSel.value) : null;
  if(!supplier){ toast('Supplier select karein', 'err'); return; }
  var po = savePORecord(items, supplier, method);
  if(method === 'whatsapp'){ po.status = 'sent'; po.sentAt = new Date().toISOString(); }
  saveDb();
  var s = db.settings;
  if(method === 'whatsapp'){
    if(!supplier.phone){ toast('Supplier ka phone nahi hai', 'err'); return; }
    var msg = '*📋 PURCHASE ORDER*\n━━━━━━━━━━━━━━━\n*' + s.storeName + '*\n\n';
    msg += 'PO #: ' + po.poNumber + '\nDate: ' + new Date().toLocaleDateString('en-GB') + '\n\n';
    msg += 'Items (' + items.length + '):\n';
    items.forEach(function(it, i){
      msg += (i+1) + '. ' + it.description + ' — Qty: ' + it.qty + (it.unitPrice ? ' @ ' + money(it.unitPrice) : '') + '\n';
    });
    msg += '\nTotal: ' + money(po.total) + '\n\n— ' + s.storeName;
    var phone = String(supplier.phone).replace(/\D/g,'');
    if(phone.length === 10) phone = '92' + phone;
    if(phone.length === 11 && phone.startsWith('0')) phone = '92' + phone.substring(1);
    window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(msg), '_blank');
    toast('✓ WhatsApp pe bheja');
    window.__poPlaceItems = [];
    var m = document.querySelector('.modal-bg'); if(m) m.remove();
    renderView();
    return;
  }
  if(method === 'print'){
    var html = buildPurchaseOrderHTML({
      items: items.map(function(it){ return { itemNo: it.productId ? 'INV' : 'NEW', description: it.description, qty: it.qty, unitPrice: it.unitPrice }; }),
      poNumber: po.poNumber, supplier: supplier, shipVia: 'By Road', terms: 'Payment 7 days',
      notes: 'Supply in good condition.', discount: 0, shipping: 0,
      taxRate: db.settings.taxEnabled ? (db.settings.taxRate || 0) : 0
    });
    openPrintWindow(po.poNumber, html);
    window.__poPlaceItems = [];
    var m2 = document.querySelector('.modal-bg'); if(m2) m2.remove();
    renderView();
  }
}
function openPrintWindow(title, html){
  var w = window.open('', '_blank');
  w.document.write('<!DOCTYPE html><html><head><title>' + esc(title) + '</title>' +
    '<style>body{margin:0;padding:20px;background:#f1f5f9;font-family:Arial;}' +
    '@media print{body{background:#fff;padding:0;} .no-print{display:none !important;}}' +
    '.no-print{position:fixed;top:20px;right:20px;z-index:100;display:flex;gap:8px;}' +
    '.no-print button{padding:10px 18px;border:none;border-radius:8px;font-weight:700;cursor:pointer;}' +
    '.btn-print{background:#047857;color:#fff;} .btn-close{background:#dc2626;color:#fff;}</style></head><body>' +
    '<div class="no-print"><button class="btn-print" onclick="window.print()">🖨 Print</button>' +
    '<button class="btn-close" onclick="window.close()">✕ Close</button></div>' + html + '</body></html>');
  w.document.close();
}
function buildPurchaseOrderHTML(opts){
  opts = opts || {};
  var s = db.settings;
  var supplier = opts.supplier || null;
  var items = opts.items || [];
  var poNumber = opts.poNumber || nextPONumber();
  var itemsRows = items.map(function(it, i){
    var lineTotal = it.qty * it.unitPrice;
    return '<tr><td style="padding:6px 10px;font-size:11px;">' + esc(it.itemNo || 'ITEM-' + (i+1)) + '</td>' +
      '<td style="padding:6px 10px;font-size:11px;font-weight:600;">' + esc(it.description) + '</td>' +
      '<td style="padding:6px 10px;font-size:11px;text-align:center;">' + it.qty + '</td>' +
      '<td style="padding:6px 10px;font-size:11px;text-align:right;">' + (it.unitPrice || 0) + '</td>' +
      '<td style="padding:6px 10px;font-size:11px;text-align:right;font-weight:600;">' + lineTotal + '</td></tr>';
  }).join('');
  var subtotal = items.reduce(function(a,x){ return a + x.qty * x.unitPrice; }, 0);
  return '<div style="background:#fff;padding:36px 40px;font-family:Arial;max-width:800px;margin:0 auto;">' +
    '<div style="height:6px;background:#fbbf24;margin:-36px -40px 30px;"></div>' +
    '<table style="width:100%;margin-bottom:24px;"><tr>' +
      '<td style="width:50%;"><div style="font-size:24px;margin-bottom:8px;">' + esc(s.storeName) + '</div>' +
        '<div style="font-size:11px;color:#4b5563;line-height:1.6;">' + esc(s.address||'') + '<br>' + esc(s.phone||'') + '</div></td>' +
      '<td style="width:50%;text-align:right;"><div style="font-size:24px;font-weight:800;margin-bottom:8px;">Purchase Order</div>' +
        '<div style="font-size:11px;">Date: ' + new Date().toLocaleDateString('en-GB') + '<br>PO #: ' + poNumber + '</div></td>' +
    '</tr></table>' +
    '<div style="height:1px;background:#d1d5db;margin:20px 0;"></div>' +
    '<table style="width:100%;margin-bottom:20px;font-size:11px;"><tr>' +
      '<td style="width:50%;"><b>Vendor</b><br>' + (supplier ? esc(supplier.name) + '<br>' + esc(supplier.address||'') + '<br>' + esc(supplier.phone||'') : '—') + '</td>' +
      '<td style="width:50%;"><b>Ship To</b><br>' + esc(s.storeName) + '<br>' + esc(s.address||'') + '</td>' +
    '</tr></table>' +
    '<table style="width:100%;border-collapse:collapse;font-size:11px;"><thead>' +
      '<tr style="background:#e5e7eb;"><th style="padding:8px;text-align:left;">Item</th><th style="padding:8px;text-align:left;">Description</th>' +
      '<th style="padding:8px;text-align:center;">Qty</th><th style="padding:8px;text-align:right;">Price</th><th style="padding:8px;text-align:right;">Total</th></tr>' +
      '</thead><tbody>' + itemsRows + '</tbody></table>' +
    '<div style="margin-top:20px;text-align:right;font-size:14px;"><b>Total: ' + s.currency + ' ' + subtotal.toFixed(2) + '</b></div>' +
  '</div>';
}

/* ═══════════ CUSTOMER ORDERS ═══════════ */
function viewCustomerOrders(){
  var list = (db.customerOrders || []).slice().reverse();
  if(!list.length){
    return '<div class="card"><div class="empty">📭 Koi customer order nahi.<br><br>' +
      '<button type="button" class="btn primary" id="co-test-open">🛒 Test Portal</button></div></div>';
  }
  var rows = list.map(function(o){
    var cls = o.status === 'new' ? 'blue' : o.status === 'confirmed' ? 'warn' : o.status === 'delivered' ? 'ok' : 'red';
    var actions = '';
    if(o.status === 'new') actions = '<button type="button" class="btn xs primary" data-action="co-confirm" data-id="'+o.id+'">✓ Confirm</button> ';
    if(o.status === 'confirmed') actions = '<button type="button" class="btn xs primary" data-action="co-deliver" data-id="'+o.id+'">📦 Deliver</button> ';
    actions += '<button type="button" class="btn xs" data-action="co-view" data-id="'+o.id+'">View</button> ';
    if(o.status === 'delivered') actions += '<button type="button" class="btn xs" data-action="co-print-slip" data-id="'+o.id+'">🖨</button> ';
    actions += '<button type="button" class="btn xs" data-action="co-wa" data-id="'+o.id+'">📱</button> ';
    if(o.status !== 'delivered' && o.status !== 'cancelled') actions += '<button type="button" class="btn xs danger" data-action="co-cancel" data-id="'+o.id+'">×</button>';
    return '<tr><td class="mono"><b>'+esc(o.orderNo)+'</b></td><td>'+fmtDate(o.date)+'</td>' +
      '<td><strong>'+esc(o.customerName)+'</strong><div class="muted">📞 '+esc(o.customerPhone)+'</div></td>' +
      '<td>'+(o.items||[]).length+' items</td>' +
      '<td class="right mono"><b>'+money(o.total)+'</b></td>' +
      '<td><span class="pill '+cls+'">'+esc(o.status.toUpperCase())+'</span></td>' +
      '<td class="center">'+actions+'</td></tr>';
  }).join('');
  return '<div class="card"><h3>🛒 Customer Orders</h3>' +
    '<div class="table-wrap"><table><thead><tr><th>Order #</th><th>Date</th><th>Customer</th><th>Items</th><th class="right">Total</th><th>Status</th><th class="center">Actions</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>';
}
function openCustomerOrderView(orderId){
  var o = (db.customerOrders || []).find(function(x){ return x.id === orderId; });
  if(!o){ toast('Order not found', 'err'); return; }
  if(!o.seen){ o.seen = true; saveDb(); }
  var cls = o.status === 'new' ? 'blue' : o.status === 'confirmed' ? 'warn' : o.status === 'delivered' ? 'ok' : 'red';
  var itemsHtml = (o.items||[]).map(function(it, i){
    return '<div class="ledger-row"><div><div><b>'+(i+1)+'. '+esc(it.name)+'</b></div>' +
      '<div class="muted">'+it.qty+' × '+money(it.price)+' = <b>'+money(it.qty*it.price)+'</b></div></div></div>';
  }).join('');
  var body = '<div class="grid cols-2" style="margin-bottom:14px;">' +
      '<div><div class="muted">Order #</div><b>'+esc(o.orderNo)+'</b></div>' +
      '<div><div class="muted">Status</div><span class="pill '+cls+'">'+esc(o.status.toUpperCase())+'</span></div>' +
      '<div><div class="muted">Date</div><b>'+fmtDate(o.date)+'</b></div>' +
      '<div><div class="muted">Total</div><b>'+money(o.total)+'</b></div>' +
    '</div>' +
    '<h3 style="font-size:13px;">👤 Customer</h3>' +
    '<div class="ledger-row"><span>Name</span><b>'+esc(o.customerName)+'</b></div>' +
    '<div class="ledger-row"><span>Phone</span><b>'+esc(o.customerPhone)+'</b></div>' +
    '<div class="ledger-row"><span>Address</span><span>'+esc(o.customerAddress)+'</span></div>' +
    '<div class="divider"></div>' +
    '<h3 style="font-size:13px;">📦 Items</h3>' + itemsHtml +
    '<div class="divider"></div>' +
    '<div class="totals"><div class="tot-row big"><span class="l">TOTAL</span><span class="mono">'+money(o.total)+'</span></div></div>';
  var foot = '<button type="button" class="btn" data-close>Close</button>';
  if(o.status === 'delivered') foot = '<button type="button" class="btn" data-action="co-print-slip" data-id="'+o.id+'">🖨 Slip</button>' + foot;
  foot = '<button type="button" class="btn primary" data-action="co-wa" data-id="'+o.id+'">📱 WhatsApp</button>' + foot;
  var bg = openModal('Order — '+o.orderNo, body, foot, { wide:true });
  setTimeout(function(){
    bg.querySelectorAll('[data-action]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var act = btn.dataset.action, id = btn.dataset.id;
        bg.remove();
        if(act === 'co-confirm') confirmCustomerOrder(id);
        else if(act === 'co-deliver') deliverCustomerOrder(id);
        else if(act === 'co-wa') whatsappCustomerOrder(id);
        else if(act === 'co-print-slip') printDeliverySlip(id);
      });
    });
  }, 30);
}
function confirmCustomerOrder(orderId){
  var o = (db.customerOrders || []).find(function(x){ return x.id === orderId; });
  if(!o) return;
  o.status = 'confirmed';
  o.confirmedAt = new Date().toISOString();
  addAuditLog('Order Confirmed', o.orderNo);
  saveDb(); renderView();
  toast('✓ Confirmed');
}
function deliverCustomerOrder(orderId){
  var o = (db.customerOrders || []).find(function(x){ return x.id === orderId; });
  if(!o) return;
  var prev = o.delivery || {};
  var body = '<div class="row">' +
      '<div class="field"><label>Delivery Boy Name *</label><input id="dl-boy-name" value="'+esc(prev.boyName||'')+'" autofocus/></div>' +
      '<div class="field"><label>Delivery Boy Phone *</label><input id="dl-boy-phone" value="'+esc(prev.boyPhone||'')+'"/></div>' +
    '</div>' +
    '<div class="row">' +
      '<div class="field"><label>Vehicle</label><input id="dl-vehicle" value="'+esc(prev.vehicle||'')+'"/></div>' +
      '<div class="field"><label>Charges</label><input type="number" id="dl-charges" value="'+(prev.charges||0)+'" step="any"/></div>' +
    '</div>' +
    '<div class="field"><label>Notes</label><input id="dl-notes" value="'+esc(prev.notes||'')+'"/></div>';
  var bg = openModal('🚚 Mark Delivered', body,
    '<button type="button" class="btn" data-close>Cancel</button>' +
    '<button type="button" class="btn primary" id="dl-confirm">✓ Confirm</button>',
    { wide:true });
  setTimeout(function(){
    var btn = document.getElementById('dl-confirm');
    if(!btn) return;
    btn.addEventListener('click', function(){
      var boyName = document.getElementById('dl-boy-name').value.trim();
      var boyPhone = document.getElementById('dl-boy-phone').value.trim();
      if(!boyName || !boyPhone){ toast('Name + phone required', 'err'); return; }
      var vehicle = document.getElementById('dl-vehicle').value.trim();
      var charges = +document.getElementById('dl-charges').value || 0;
      var notes = document.getElementById('dl-notes').value.trim();
      o.status = 'delivered';
      o.deliveredAt = new Date().toISOString();
      o.delivery = { boyName, boyPhone, vehicle, charges, notes, deliveredAt: o.deliveredAt };
      if(charges > 0){ o.deliveryCharges = charges; o.total = (o.subtotal || 0) + charges; }
      addAuditLog('Order Delivered', o.orderNo + ' · by ' + boyName);
      saveDb(); bg.remove(); renderView();
      toast('✓ Delivered');
    });
  }, 40);
}
function cancelCustomerOrder(orderId){
  var o = (db.customerOrders || []).find(function(x){ return x.id === orderId; });
  if(!o) return;
  o.status = 'cancelled';
  addAuditLog('Order Cancelled', o.orderNo);
  saveDb(); renderView();
  toast('Cancelled');
}
function whatsappCustomerOrder(orderId){
  var o = (db.customerOrders || []).find(function(x){ return x.id === orderId; });
  if(!o) return;
  var s = db.settings;
  var phone = (o.customerPhone || '').replace(/\D/g,'');
  if(phone.length === 10) phone = '92' + phone;
  if(phone.length === 11 && phone.startsWith('0')) phone = '92' + phone.substring(1);
  var msg = '*🏪 ' + s.storeName + '*\n━━━━━━━━━━━━━━━\n\nAssalam-o-Alaikum *' + o.customerName + '*,\n\n';
  msg += 'Aap ka order *' + o.orderNo + '*\n\n*📦 Items:*\n';
  o.items.forEach(function(it, i){ msg += (i+1)+'. ' + it.name + ' × ' + it.qty + ' = ' + money(it.qty*it.price) + '\n'; });
  msg += '\n*💰 TOTAL: ' + money(o.total) + '*\n\n';
  if(o.status === 'new') msg += '⏳ Jald confirm karenge.\n';
  else if(o.status === 'confirmed') msg += '✅ Confirm — jald deliver hoga.\n';
  else if(o.status === 'delivered'){
    msg += '✅ Delivered by ' + o.delivery.boyName + '\n📞 ' + o.delivery.boyPhone + '\n';
  }
  msg += '\n📞 ' + s.phone + '\n— ' + s.storeName;
  window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(msg), '_blank');
}
function printDeliverySlip(orderId){
  var o = (db.customerOrders || []).find(function(x){ return x.id === orderId; });
  if(!o || !o.delivery){ toast('Delivery details nahi', 'warn'); return; }
  var s = db.settings;
  var d = o.delivery;
  var itemsHtml = o.items.map(function(it){
    return '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px;">' +
      '<span>'+esc(it.name)+' x'+it.qty+'</span><span>'+(it.qty*it.price).toFixed(2)+'</span></div>';
  }).join('');
  var logoHtml = (s.printLogo !== false && s.logo) ? '<div style="text-align:center;"><img src="'+s.logo+'" style="max-width:60px;"/></div>' : '';
  var html = '<div class="receipt receipt-80" style="font-family:Courier New,monospace;padding:8px;max-width:80mm;margin:0 auto;">' +
    logoHtml +
    '<div style="text-align:center;font-size:14px;font-weight:800;">'+esc(s.storeName).toUpperCase()+'</div>' +
    '<div style="text-align:center;font-size:9px;">'+esc(s.address||'')+'</div>' +
    '<div style="border-top:2px solid #000;margin:6px 0;"></div>' +
    '<div style="text-align:center;font-size:12px;font-weight:800;">DELIVERY SLIP</div>' +
    '<div style="border-top:2px solid #000;margin:6px 0;"></div>' +
    '<div style="font-size:10px;">Order: '+esc(o.orderNo)+'<br>Date: '+fmtDate(o.date)+'<br>Delivered: '+fmtDateTime(d.deliveredAt)+'</div>' +
    '<div style="border-top:1px dashed #000;margin:6px 0;"></div>' +
    '<div style="font-size:11px;"><b>'+esc(o.customerName)+'</b><br>📞 '+esc(o.customerPhone)+'<br>📍 '+esc(o.customerAddress)+'</div>' +
    '<div style="border-top:1px dashed #000;margin:6px 0;"></div>' +
    '<div style="font-size:10px;"><b>🚚 Delivered by:</b> '+esc(d.boyName)+'<br>📞 '+esc(d.boyPhone)+'</div>' +
    '<div style="border-top:1px dashed #000;margin:6px 0;"></div>' +
    itemsHtml +
    '<div style="border-top:2px solid #000;margin:6px 0;"></div>' +
    '<div style="display:flex;justify-content:space-between;font-size:13px;font-weight:800;"><span>TOTAL</span><span>'+s.currency+' '+o.total.toFixed(2)+'</span></div>' +
    '<div style="border-top:2px solid #000;margin:6px 0;"></div>' +
    '<div style="text-align:center;font-size:9px;margin-top:10px;">Customer Signature: ___________</div>' +
    '<div style="text-align:center;font-size:10px;margin-top:8px;font-weight:700;">'+esc(s.footer||'SHUKRIYA!')+'</div>' +
  '</div>';
  var root = document.getElementById('print-root');
  if(!root){ root = document.createElement('div'); root.id = 'print-root'; document.body.appendChild(root); }
  root.innerHTML = html;
  waitForImages(root, function(){ try{ window.print(); }catch(e){} });
  setTimeout(function(){ root.innerHTML = ''; }, 30000);
}

/* ═══════════ RETURNS ═══════════ */
function viewReturns(){
  var list = (db.returns||[]).slice().reverse();
  return '<div class="toolbar"><button type="button" class="btn primary" data-action="new-return">+ New Return</button></div>' +
    '<div class="card">' +
      (list.length
        ? '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Invoice</th><th>Customer</th><th class="right">Amount</th><th>Mode</th></tr></thead><tbody>' +
          list.map(function(r){
            return '<tr><td>'+fmtDate(r.date)+'</td><td class="mono">'+esc(r.invoiceNo)+'</td>' +
              '<td>'+esc(r.customerName)+'</td><td class="right mono">'+money(r.total)+'</td>' +
              '<td><span class="pill gray">'+esc(r.refundMode||'Cash')+'</span></td></tr>';
          }).join('') + '</tbody></table></div>'
        : '<div class="empty">No returns yet.</div>') +
    '</div>';
}
function openReturnModal(){
  var body = '<div class="field"><label>Invoice / Order #</label><input id="ret-inv" placeholder="Search..." autofocus/></div>' +
    '<div id="ret-hits" class="mt"></div>';
  var bg = openModal('New Return', body, '<button type="button" class="btn" data-close>Close</button>', { wide:true });
  setTimeout(function(){
    var inp = document.getElementById('ret-inv');
    if(!inp) return;
    inp.focus();
    inp.addEventListener('input', function(){
      var q = inp.value.trim().toLowerCase();
      if(!q){ document.getElementById('ret-hits').innerHTML = ''; return; }
      var saleHits = db.sales.filter(function(s){
        return (s.invoiceNo||'').toLowerCase().indexOf(q) >= 0 || (s.slipNo||'').toLowerCase().indexOf(q) >= 0;
      }).slice(-15).reverse();
      if(!saleHits.length){
        document.getElementById('ret-hits').innerHTML = '<div class="empty">No match.</div>';
        return;
      }
      document.getElementById('ret-hits').innerHTML = saleHits.map(function(s){
        return '<div class="ledger-row" data-pick-sale="'+s.id+'" style="cursor:pointer;">' +
          '<div><div class="mono">'+esc(s.slipNo||s.invoiceNo)+'</div>' +
          '<div class="muted">'+fmtDate(s.date)+' · '+esc(s.customerName)+'</div></div>' +
          '<span class="mono">'+money(s.total)+'</span></div>';
      }).join('');
      document.getElementById('ret-hits').onclick = function(e){
        var saleEl = e.target.closest('[data-pick-sale]');
        if(!saleEl) return;
        var sale = db.sales.find(function(s){ return s.id === saleEl.dataset.pickSale; });
        if(!sale) return;
        bg.remove();
        openReturnItems(sale);
      };
    });
  }, 30);
}
function openReturnItems(sale){
  var items = sale.items || [];
  var itemsHtml = items.map(function(it, i){
    return '<div class="ledger-row" style="align-items:center;gap:8px;">' +
      '<div style="flex:1;"><div><strong>'+esc(it.name)+'</strong></div>' +
      '<div class="muted">'+it.qty+' × '+money(it.unitPrice)+'</div></div>' +
      '<input type="number" data-ri="'+i+'" data-max="'+it.qty+'" value="0" min="0" max="'+it.qty+'" style="width:80px;"/>' +
    '</div>';
  }).join('');
  var body = '<div class="alert alert-info">Return qty likhein.</div>' + itemsHtml +
    '<div class="divider"></div>' +
    '<div class="row">' +
      '<div class="field"><label>Refund Mode</label><select id="ret-mode"><option value="Cash">Cash</option><option value="Adjust">Adjust Ledger</option></select></div>' +
      '<div class="field"><label>Reason</label><input id="ret-reason"/></div>' +
    '</div>';
  var bg = openModal('Return — '+(sale.slipNo||sale.invoiceNo), body,
    '<button type="button" class="btn" data-close>Cancel</button>' +
    '<button type="button" class="btn primary" id="do-return">Process</button>',
    { wide:true });
  setTimeout(function(){
    var btn = document.getElementById('do-return');
    if(!btn) return;
    btn.addEventListener('click', function(){
      var retItems = [];
      $$('[data-ri]').forEach(function(inp){
        var i = +inp.dataset.ri;
        var q = Math.min(+inp.value || 0, +inp.dataset.max);
        if(q > 0){
          var it = items[i];
          retItems.push({ productId: it.productId, batchId: it.batchId, mode: it.mode || 'pack',
            name: it.name, batch: it.batch || '', packSize: it.packSize || 1, unitLabel: it.unitLabel || 'unit',
            qty: q, unitPrice: it.unitPrice || 0, total: q * (it.unitPrice || 0) });
        }
      });
      if(!retItems.length){ toast('No items selected', 'err'); return; }
      var total = retItems.reduce(function(a,x){ return a+x.total; }, 0);
      var mode = document.getElementById('ret-mode').value;
      var reason = document.getElementById('ret-reason').value.trim() || 'Return';
      retItems.forEach(function(ri){
        if(!ri.productId) return;
        var p = findProduct(ri.productId);
        if(!p) return;
        if(ri.batchId){
          var b = p.batches.find(function(bb){ return bb.id === ri.batchId; });
          if(b){ var units = ri.mode === 'pack' ? ri.qty * p.packSize : ri.qty; b.qty += units; }
        }
      });
      var cust = findCustomer(sale.customerId);
      if(mode === 'Adjust' && cust && cust.id !== 'c1'){
        cust.ledger = cust.ledger || [];
        cust.ledger.push({ id: uid('l'), date: new Date().toISOString(), type: 'payment', amount: total, note: 'Return ' + sale.invoiceNo });
      }
      db.returns.push({ id: uid('ret'), date: new Date().toISOString(),
        invoiceNo: sale.invoiceNo, customerName: sale.customerName, customerPhone: sale.customerPhone || '',
        items: retItems, total: total, refundMode: mode, reason: reason });
      addAuditLog('Return Processed', sale.invoiceNo + ' · ' + money(total));
      saveDb(); bg.remove(); renderView();
      toast('✓ Return: '+money(total));
    });
  }, 30);
}

/* ═══════════ EXPIRY ═══════════ */
function viewExpiryReport(){
  return '<div class="toolbar">' +
    '<button type="button" class="btn" data-expiry-filter="all">All</button>' +
    '<button type="button" class="btn" data-expiry-filter="expired">Expired</button>' +
    '<button type="button" class="btn active-primary" data-expiry-filter="30">30 Days</button>' +
    '<button type="button" class="btn" data-expiry-filter="60">60 Days</button>' +
    '<button type="button" class="btn" data-expiry-filter="90">90 Days</button>' +
    '<span class="spacer" style="flex:1;"></span>' +
    '<button type="button" class="btn primary" id="expiry-print">Print Report</button>' +
  '</div>' +
  '<div class="grid cols-4" id="expiry-stats"></div>' +
  '<div class="card mt"><div class="table-wrap" id="expiry-wrap"></div></div>';
}
function renderExpiryTable(filter){
  filter = filter || '30';
  var rows = [];
  var stats = { expired:0, d30:0, d60:0, d90:0 };
  db.products.forEach(function(p){
    (p.batches||[]).forEach(function(b){
      if(b.qty <= 0) return;
      var dleft = daysUntil(b.expiry);
      if(dleft <= 90) rows.push({ product:p.name, company:p.company||'', batch:b.batch, expiry:b.expiry, dleft:dleft, qty:b.qty, value:b.qty * (b.cost||0), unitLabel:p.unitLabel||'Tab' });
      if(dleft < 0) stats.expired += b.qty;
      else if(dleft <= 30) stats.d30 += b.qty;
      else if(dleft <= 60) stats.d60 += b.qty;
      else if(dleft <= 90) stats.d90 += b.qty;
    });
  });
  rows.sort(function(a,b){ return a.dleft - b.dleft; });
  var filtered = rows.filter(function(r){
    if(filter === 'all') return true;
    if(filter === 'expired') return r.dleft < 0;
    return r.dleft >= 0 && r.dleft <= parseInt(filter);
  });
  var totalValue = filtered.reduce(function(a,r){ return a + r.value; }, 0);
  var statsEl = document.getElementById('expiry-stats');
  if(statsEl){
    statsEl.innerHTML =
      '<div class="stat red"><div class="lbl">Expired</div><div class="val">'+stats.expired+'</div></div>' +
      '<div class="stat warn"><div class="lbl">30 Days</div><div class="val">'+stats.d30+'</div></div>' +
      '<div class="stat warn"><div class="lbl">60 Days</div><div class="val">'+stats.d60+'</div></div>' +
      '<div class="stat"><div class="lbl">Value at Risk</div><div class="val">'+money(totalValue)+'</div></div>';
  }
  var wrap = document.getElementById('expiry-wrap');
  if(!wrap) return;
  if(!filtered.length){ wrap.innerHTML = '<div class="empty">Kuch nahi mila ✅</div>'; return; }
  wrap.innerHTML = '<table><thead><tr><th>Medicine</th><th>Batch</th><th>Expiry</th><th class="right">Days</th><th class="right">Stock</th><th class="right">Value</th></tr></thead><tbody>' +
    filtered.map(function(r){
      var cls = r.dleft < 0 ? 'red' : (r.dleft <= 30 ? 'red' : (r.dleft <= 60 ? 'warn' : 'ok'));
      return '<tr><td><strong>'+esc(r.product)+'</strong></td><td class="mono">'+esc(r.batch)+'</td>' +
        '<td>'+fmtDate(r.expiry)+'</td>' +
        '<td class="right"><span class="pill '+cls+'">'+(r.dleft < 0 ? 'EXPIRED' : r.dleft + 'd')+'</span></td>' +
        '<td class="right mono">'+r.qty+' '+esc(r.unitLabel)+'</td>' +
        '<td class="right mono">'+money(r.value)+'</td></tr>';
    }).join('') + '</tbody></table>';
}

/* ═══════════ REORDER ═══════════ */
var poCustomItems = {};
function findSupplierForCompany(company){
  if(!company) return null;
  function norm(str){ return String(str || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  var comp = norm(company);
  if(!comp) return null;
  for(var i=0; i<db.suppliers.length; i++){
    var s = db.suppliers[i];
    if(s.companies && s.companies.length){
      for(var j=0; j<s.companies.length; j++){
        var sc = norm(s.companies[j]);
        if(sc === comp || sc.indexOf(comp) >= 0 || comp.indexOf(sc) >= 0) return s;
      }
    }
    var sn = norm(s.name);
    if(sn.indexOf(comp) >= 0 || comp.indexOf(sn) >= 0) return s;
  }
  return null;
}
function viewReorder(){
  var low = db.products.filter(function(p){ return totalStock(p) <= (p.minStock || db.settings.lowStock); });
  var groups = {};
  var unassigned = [];
  low.forEach(function(p){
    var sup = findSupplierForCompany(p.company);
    if(sup){
      if(!groups[sup.id]) groups[sup.id] = { supplier: sup, products: [] };
      groups[sup.id].products.push(p);
    } else unassigned.push(p);
  });
  if(!Object.keys(groups).length && !unassigned.length){
    return '<div class="card"><div class="empty">✅ Sab products stock mein.</div></div>';
  }
  var html = '';
  if(unassigned.length){
    html += '<div class="card" style="border-color:var(--warn);"><h3 style="color:var(--warn);">⚠ Unassigned (' + unassigned.length + ')</h3>' +
      unassigned.map(function(p){
        return '<div class="ledger-row"><div><div><b>'+esc(p.name)+'</b></div><div class="muted">Company: '+esc(p.company||'Unknown')+'</div></div>' +
          '<span class="pill warn">No Supplier</span></div>';
      }).join('') + '</div>';
  }
  Object.keys(groups).forEach(function(sid){
    var g = groups[sid];
    html += '<div class="card mt"><h3>🏭 '+esc(g.supplier.name)+'</h3>' +
      '<div class="table-wrap"><table><thead><tr><th>Medicine</th><th class="right">Stock</th><th class="right">Order Qty</th></tr></thead><tbody>' +
      g.products.map(function(p){
        var cur = totalStock(p);
        var min = p.minStock || db.settings.lowStock;
        var suggest = Math.max(min * 2 - cur, 10);
        return '<tr><td>'+esc(p.name)+'</td><td class="right mono">'+stockDisplay(p)+'</td>' +
          '<td class="right"><input type="number" data-order-qty="'+p.id+'" data-supplier="'+sid+'" value="'+suggest+'" style="width:80px;"/></td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="flex mt" style="gap:8px;">' +
        '<button type="button" class="btn primary" data-action="po-send-wa" data-id="'+sid+'">📱 WhatsApp</button>' +
        '<button type="button" class="btn" data-action="po-print-supplier" data-id="'+sid+'">🖨 Print</button>' +
      '</div></div>';
  });
  return html;
}
function collectSupplierItems(supplierId){
  var items = [];
  document.querySelectorAll('[data-order-qty][data-supplier="'+supplierId+'"]').forEach(function(inp){
    var pid = inp.dataset.orderQty;
    var p = findProduct(pid);
    if(!p) return;
    var qty = +inp.value || 0;
    if(qty <= 0) return;
    var b = (p.batches||[])[0];
    items.push({ productId: pid, itemNo: p.barcode || 'ITEM', description: p.name + (p.packing ? ' — ' + p.packing : ''),
      qty: qty, unitPrice: b ? b.cost : 0, packSize: p.packSize, isCustom: false });
  });
  return items;
}
function sendSupplierPOWhatsApp(supplierId){
  var sup = findSupplier(supplierId);
  if(!sup || !sup.phone){ toast('Supplier ka phone nahi', 'err'); return; }
  var items = collectSupplierItems(supplierId);
  if(!items.length){ toast('Koi item select nahi', 'warn'); return; }
  var po = savePORecord(items, sup, 'whatsapp');
  po.status = 'sent'; po.sentAt = new Date().toISOString();
  saveDb();
  var s = db.settings;
  var msg = '*📋 PURCHASE ORDER*\n━━━━━━━━━━━━━━━\n*' + s.storeName + '*\n\nPO #: ' + po.poNumber + '\n\nItems:\n';
  items.forEach(function(it, i){ msg += (i+1)+'. ' + it.description + ' — Qty: ' + it.qty + '\n'; });
  msg += '\nTotal: ' + money(po.total) + '\n\n— ' + s.storeName;
  var phone = String(sup.phone).replace(/\D/g,'');
  if(phone.length === 10) phone = '92' + phone;
  if(phone.length === 11 && phone.startsWith('0')) phone = '92' + phone.substring(1);
  window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(msg), '_blank');
  toast('✓ WhatsApp pe bheja');
  renderView();
}
function printSupplierPO(supplierId){
  var sup = findSupplier(supplierId);
  if(!sup) return;
  var items = collectSupplierItems(supplierId);
  if(!items.length){ toast('Koi item select nahi', 'warn'); return; }
  var po = savePORecord(items, sup, 'print');
  var html = buildPurchaseOrderHTML({
    items: items, poNumber: po.poNumber, supplier: sup, shipVia: 'By Road',
    terms: '7 days', notes: 'Supply in good condition.', discount: 0, shipping: 0,
    taxRate: db.settings.taxEnabled ? (db.settings.taxRate || 0) : 0
  });
  openPrintWindow(po.poNumber, html);
  toast('✓ Ready to print');
  renderView();
}

/* ═══════════ AUDIT ═══════════ */
function viewAuditLog(){
  var log = (db.auditLog || []).slice().reverse();
  return '<div class="toolbar">' +
    '<input id="audit-search" placeholder="Search..." style="flex:1;max-width:400px;"/>' +
    '<button type="button" class="btn" id="audit-export">Export CSV</button>' +
    '<button type="button" class="btn danger" id="audit-clear">Clear</button>' +
  '</div>' +
  '<div class="card"><div class="table-wrap" id="audit-wrap">'+auditTable(log, '')+'</div></div>';
}
function auditTable(list, q){
  if(q){
    var ql = q.toLowerCase();
    list = list.filter(function(l){
      return (l.user||'').toLowerCase().indexOf(ql) >= 0 || (l.action||'').toLowerCase().indexOf(ql) >= 0 || (l.detail||'').toLowerCase().indexOf(ql) >= 0;
    });
  }
  if(!list.length) return '<div class="empty">No activity.</div>';
  return '<table><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Details</th></tr></thead><tbody>' +
    list.map(function(l){
      return '<tr><td>'+new Date(l.at).toLocaleString('en-GB')+'</td>' +
        '<td><strong>'+esc(l.user||'system')+'</strong></td>' +
        '<td>'+esc(l.action||'')+'</td><td>'+esc(l.detail||'')+'</td></tr>';
    }).join('') + '</tbody></table>';
}

/* ═══════════ SALES ═══════════ */
function viewSales(){
  var all = (db.sales||[]).slice().reverse();
  return '<div class="toolbar">' +
    '<button type="button" class="btn active-primary" data-sales-filter="all">All ('+all.length+')</button>' +
    '<button type="button" class="btn" data-sales-filter="retail">Retail</button>' +
    '<button type="button" class="btn" data-sales-filter="wholesale">Wholesale</button>' +
  '</div>' +
  '<div class="card"><div class="table-wrap" id="sales-wrap">'+salesTable(all, 'all')+'</div></div>';
}
function salesTable(list, filter){
  if(filter !== 'all'){
    list = list.filter(function(s){
      if(filter === 'wholesale') return s.saleType === 'wholesale';
      return s.saleType !== 'wholesale';
    });
  }
  if(!list.length) return '<div class="empty">No sales.</div>';
  return '<table><thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Type</th><th class="right">Total</th><th>Mode</th><th class="center">Actions</th></tr></thead><tbody>' +
    list.map(function(s){
      return '<tr><td class="mono">'+esc(s.invoiceNo)+'</td><td>'+fmtDate(s.date)+'</td>' +
        '<td>'+esc(s.customerName||'Walk-in')+'</td>' +
        '<td><span class="pill '+(s.saleType==='wholesale'?'purple':'ok')+'">'+(s.saleType==='wholesale'?'WS':'Retail')+'</span></td>' +
        '<td class="right mono">'+money(s.total)+'</td>' +
        '<td><span class="pill '+(s.payMode==='Credit'?'warn':'gray')+'">'+s.payMode+'</span></td>' +
        '<td class="center">' +
          '<button type="button" class="btn xs" data-action="print-sale" data-id="'+s.id+'">🖨</button> ' +
          (s.payMode === 'Credit' && s.customerId !== 'c1' && s.customerPhone ? '<button type="button" class="btn xs" data-action="send-sale-bill" data-id="'+s.id+'" title="WhatsApp Bill">📱</button> ' : '') +
          '<button type="button" class="btn xs danger" data-action="del-sale" data-id="'+s.id+'">×</button>' +
        '</td></tr>';
    }).join('') + '</tbody></table>';
}

/* ═══════════ REPORTS ═══════════ */
function viewReports(){
  return '<div class="toolbar">' +
    '<input type="date" id="rp-from" value="'+new Date(Date.now()-30*86400000).toISOString().slice(0,10)+'"/>' +
    '<input type="date" id="rp-to" value="'+todayISO()+'"/>' +
    '<button type="button" class="btn primary" id="rp-run">Run</button>' +
  '</div><div id="rp-out"></div>';
}
function runReport(){
  var fromEl = $('#rp-from'), toEl = $('#rp-to'), out = $('#rp-out');
  if(!fromEl || !toEl || !out) return;
  var from = fromEl.value, to = toEl.value;
  var sales = db.sales.filter(function(s){ return s.date.slice(0,10) >= from && s.date.slice(0,10) <= to; });
  var returns = (db.returns || []).filter(function(r){ return r.date.slice(0,10) >= from && r.date.slice(0,10) <= to; });
  var grossSales = sales.reduce(function(a,s){ return a + s.total; }, 0);
  var returnTotal = returns.reduce(function(a,r){ return a + r.total; }, 0);
  var netSales = grossSales - returnTotal;
  var disc = sales.reduce(function(a,s){ return a + (s.discount || 0); }, 0);
  var tax = sales.reduce(function(a,s){ return a + (s.taxAmount || 0); }, 0);
  var cost = sales.reduce(function(a,s){
    return a + s.items.reduce(function(x,i){
      var lineUnits = i.mode === 'pack' ? i.qty * (i.packSize || 1) : i.qty;
      var unitCost = i.mode === 'pack' ? (i.cost || 0) : ((i.cost || 0) / (i.packSize || 1));
      return x + unitCost * lineUnits;
    }, 0);
  }, 0);
  var profit = netSales - cost - tax;
  var modes = { Cash: 0, Card: 0, Credit: 0 };
  sales.forEach(function(s){ modes[s.payMode] = (modes[s.payMode] || 0) + s.total; });
  out.innerHTML = '<div class="grid cols-4">' +
      '<div class="stat green"><div class="lbl">Net Sales</div><div class="val">' + money(netSales) + '</div></div>' +
      '<div class="stat blue"><div class="lbl">Profit</div><div class="val">' + money(profit) + '</div></div>' +
      '<div class="stat warn"><div class="lbl">Discounts</div><div class="val">' + money(disc) + '</div></div>' +
      '<div class="stat red"><div class="lbl">Returns</div><div class="val">' + money(returnTotal) + '</div></div>' +
    '</div>' +
    '<div class="grid cols-2 mt"><div class="card"><h3>Payment Modes</h3>' +
      Object.keys(modes).map(function(k){ return '<div class="ledger-row"><span>' + k + '</span><span class="mono">' + money(modes[k]) + '</span></div>'; }).join('') +
    '</div></div>';
}

/* ═══════════ DAY CLOSE ═══════════ */
function viewDayClose(){
  var date = todayISO();
  var sales = db.sales.filter(function(s){ return s.date.slice(0,10) === date; });
  var byMode = { Cash:0, Card:0, Credit:0 };
  sales.forEach(function(s){ byMode[s.payMode] = (byMode[s.payMode]||0) + s.total; });
  var gross = sales.reduce(function(a,s){ return a+s.total; }, 0);
  return '<div class="grid cols-3">' +
      '<div class="stat green"><div class="lbl">Gross</div><div class="val">'+money(gross)+'</div></div>' +
      '<div class="stat"><div class="lbl">Cash</div><div class="val">'+money(byMode.Cash)+'</div></div>' +
      '<div class="stat warn"><div class="lbl">Credit</div><div class="val">'+money(byMode.Credit)+'</div></div>' +
    '</div>' +
    '<div class="card mt"><h3>Cash Reconciliation</h3>' +
      '<div class="ledger-row"><span>Expected Cash</span><span class="mono">'+money(byMode.Cash)+'</span></div>' +
      '<div class="field mt"><label>Actual Counted</label><input type="number" id="dc-counted" step="any"/></div>' +
      '<button type="button" class="btn primary mt" id="dc-save">Close Day</button>' +
    '</div>';
}

/* ═══════════ STAFF ═══════════ */
function viewStaff(){
  var staff = db.staff || [];
  return '<div class="toolbar"><button type="button" class="btn primary" data-action="add-staff">+ Add Staff</button></div>' +
    '<div class="card">' +
    (staff.length ? staff.map(function(s){
      return '<div class="staff-card"><div class="sc-head"><div>' +
          '<div class="sc-name">'+esc(s.name)+' '+(s.active===false?'<span class="pill red">Disabled</span>':'<span class="pill ok">Active</span>')+'</div>' +
          '<div class="muted">'+esc(s.u)+'</div></div>' +
        '<div><button type="button" class="btn xs" data-action="edit-staff" data-id="'+s.id+'">Edit</button> ' +
          '<button type="button" class="btn xs danger" data-action="del-staff" data-id="'+s.id+'">×</button></div></div>' +
        '<div class="sc-mods">'+(s.modules||[]).map(function(m){ return '<span>'+esc(m)+'</span>'; }).join('')+'</div></div>';
    }).join('') : '<div class="empty">No staff.</div>') +
    '</div>';
}
var ALL_MODULES = ['dashboard','counter','wholesale','inventory','purchases','purchaseorders','returns','customers','suppliers','sales','reports','expiry','reorder','dayclose','presets'];
/* ═══════════ STAFF MODAL (with Firebase Auth) ═══════════ */
function openStaffModal(staff){
  var editing = !!staff;
  var sel = (staff && staff.modules) || ['counter','sales','customers'];
  var modHtml = ALL_MODULES.map(function(m){
    return '<div class="mod-item '+(sel.indexOf(m) >= 0 ? 'on' : '')+'" data-mod="'+m+'">'+esc(m)+'</div>';
  }).join('');
  
  var body =
    '<div class="alert alert-info" style="font-size:12px;">' +
      '<b>💡 Kaise kaam karta hai:</b><br>' +
      '• Staff ka email + password likho<br>' +
      '• Firebase mein account auto-banega<br>' +
      '• Kam az kam 1 module select karo<br>' +
      '• Save karo — staff login kar sakta hai' +
    '</div>' +
    '<div class="row">' +
      '<div class="field"><label>Full Name *</label><input id="sf-name" value="'+esc(staff?staff.name:'')+'" placeholder="Ahmed Khan" autofocus/></div>' +
      '<div class="field"><label>Email Address *</label><input id="sf-user" type="email" value="'+esc(staff?staff.u:'')+'" placeholder="staff@alshifa.com" '+(editing?'readonly':'')+'/></div>' +
    '</div>' +
    (editing ? '' :
      '<div class="field"><label>Password * (min 6 chars)</label>' +
        '<input id="sf-pass" type="text" placeholder="Staff ko bata dena" value=""/>' +
        '<div class="muted" style="font-size:11px;margin-top:4px;">Yeh password staff ko dena — woh isi se login karega.</div>' +
      '</div>'
    ) +
    '<div class="field"><label>Status</label>' +
      '<select id="sf-active">' +
        '<option value="1" '+((!staff||staff.active!==false)?'selected':'')+'>Active</option>' +
        '<option value="0" '+((staff&&staff.active===false)?'selected':'')+'>Disabled</option>' +
      '</select>' +
    '</div>' +
    '<div class="divider"></div>' +
    '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:8px;">' +
      'Module Access * (kam az kam 1 select karo — click karo green hoga)' +
    '</label>' +
    '<div class="mod-grid" id="sf-modules">'+modHtml+'</div>' +
    '<div id="sf-error" style="color:var(--danger);font-size:12px;margin-top:12px;font-weight:600;min-height:20px;"></div>';
  
  var bg = openModal(editing ? 'Edit Staff — '+staff.name : 'Add Staff', body,
    '<button type="button" class="btn" data-close>Cancel</button>' +
    '<button type="button" class="btn primary" id="save-staff">' + (editing ? 'Update' : '➕ Add Staff') + '</button>',
    { wide:true });
  
  setTimeout(function(){
    var grid = document.getElementById('sf-modules');
    if(grid) grid.addEventListener('click', function(e){
      var item = e.target.closest('.mod-item');
      if(!item) return;
      item.classList.toggle('on');
      var errEl = document.getElementById('sf-error');
      if(errEl) errEl.textContent = '';
    });
    
    var btn = document.getElementById('save-staff');
    if(!btn) return;
    
    btn.addEventListener('click', async function(){
      var name = document.getElementById('sf-name').value.trim();
      var u = document.getElementById('sf-user').value.trim().toLowerCase();
      var active = document.getElementById('sf-active').value === '1';
      var modules = $$('#sf-modules .mod-item.on').map(function(el){ return el.dataset.mod; });
      var errEl = document.getElementById('sf-error');
      var passEl = document.getElementById('sf-pass');
      
      errEl.textContent = '';
      
      // ═══ Validation ═══
      if(!name){ errEl.textContent = '❌ Name likho'; return; }
      if(!u){ errEl.textContent = '❌ Email likho'; return; }
      if(!u.includes('@')){ errEl.textContent = '❌ Sahi email address likho'; return; }
      if(!modules.length){ 
        errEl.textContent = '❌ Neeche kam az kam 1 module select karo (click karo)'; 
        return; 
      }
      
      // ═══ EDIT MODE ═══
      if(editing){
        staff.name = name;
        staff.active = active;
        staff.modules = modules;
        addAuditLog('Staff Updated', name);
        saveDb();
        bg.remove();
        renderView();
        toast('✓ Staff updated');
        return;
      }
      
      // ═══ ADD MODE — Firebase Auth + Local ═══
      var password = passEl ? passEl.value : '';
      if(!password || password.length < 6){
        errEl.textContent = '❌ Password min 6 characters';
        return;
      }
      
      if((db.staff||[]).some(function(x){ return x.u === u; })){
        errEl.textContent = '❌ Yeh email already staff mein hai';
        return;
      }
      
      btn.disabled = true;
      btn.textContent = '⏳ Firebase mein account ban raha hai...';
      
      try {
        if(!window.FirebaseReady || !window.FirebaseFuncs.createUserInSecondary){
          throw new Error('Firebase Auth load nahi hua — page reload karein');
        }
        
        // ✅ Secondary app se account banao — owner ka session safe rahega!
        var credential = await window.FirebaseFuncs.createUserInSecondary(u, password);
        console.log('✓ Firebase user created:', credential.user.uid);
        
        // Local staff list mein add karo
        db.staff.push({
          id: uid('staff'),
          name: name,
          u: u,
          uid: credential.user.uid,
          active: active,
          modules: modules,
          createdAt: new Date().toISOString()
        });
        
        addAuditLog('Staff Added', name + ' · ' + u);
        saveDb();
        bg.remove();
        renderView();
        
        toast('✓ Staff added: ' + name);
        
        // Success message with credentials
        setTimeout(function(){
          alert(
            '✅ STAFF SUCCESSFULLY ADDED!\n\n' +
            '━━━━━━━━━━━━━━━━━━━━━\n' +
            'STAFF LOGIN DETAILS:\n' +
            '━━━━━━━━━━━━━━━━━━━━━\n\n' +
            '👤 Name: ' + name + '\n' +
            '📧 Email: ' + u + '\n' +
            '🔐 Password: ' + password + '\n\n' +
            '⚠️ YEH PASSWORD STAFF KO DIJIYE\n' +
            'Aap login page pe yeh details se login kar sakta hai.\n\n' +
            '✓ Owner session safe hai — aap logged in rahenge.'
          );
        }, 300);
        
      } catch(err){
        btn.disabled = false;
        btn.textContent = '➕ Add Staff';
        
        var msg = 'Error: ' + (err.message || err.code);
        if(err.code === 'auth/email-already-in-use'){
          msg = '❌ Yeh email Firebase mein already exist karta hai. Doosra email use karo.';
        } else if(err.code === 'auth/invalid-email'){
          msg = '❌ Email address galat hai';
        } else if(err.code === 'auth/weak-password'){
          msg = '❌ Password kamzor hai (min 6 characters)';
        } else if(err.code === 'auth/network-request-failed'){
          msg = '❌ Internet connection check karo';
        }
        
        errEl.textContent = msg;
        console.error('Staff add error:', err);
      }
    });
  }, 50);
}
/* ═══════════ PRESETS ═══════════ */
function viewPresets(){
  var presets = db.settings.presets||{};
  var list = Object.keys(presets).map(function(name){
    return '<div class="card" style="margin-bottom:10px;">' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:8px;">' +
        '<div style="font-weight:700;">'+esc(name)+'</div>' +
        '<div><button type="button" class="btn xs" data-action="edit-preset" data-name="'+esc(name)+'">Edit</button> ' +
        '<button type="button" class="btn xs danger" data-action="del-preset" data-name="'+esc(name)+'">×</button></div></div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:4px;">' + presets[name].map(function(m){ return '<span class="pill gray">'+esc(m)+'</span>'; }).join('') + '</div></div>';
  }).join('');
  return '<div class="toolbar"><button type="button" class="btn primary" data-action="new-preset">+ New Pack</button></div>' +
    (list || '<div class="card"><div class="empty">Koi pack nahi.</div></div>');
}
function openPresetEditor(name){
  if(presetEditorOpen) return;
  presetEditorOpen = true;
  var isEdit = !!name;
  var presets = db.settings.presets||{};
  var existingMeds = isEdit ? (presets[name]||[]).slice() : [];
  var productOptions = db.products.map(function(p){ return '<option value="'+esc(p.name)+'">'+esc(p.name)+'</option>'; }).join('');
  var body = '<div class="field"><label>Pack Name *</label><input id="pe-name" value="'+esc(isEdit?name:'')+'" '+(isEdit?'readonly':'')+'/></div>' +
    '<div class="field"><label>Add Medicine</label><div style="display:flex;gap:6px;"><select id="pe-med">'+productOptions+'</select>' +
      '<button type="button" class="btn primary sm" id="pe-add-med">+ Add</button></div></div>' +
    '<div class="divider"></div><div id="pe-meds-list"></div>';
  var bg = openModal(isEdit ? 'Edit Pack' : 'New Pack', body,
    '<button type="button" class="btn" data-close>Cancel</button>' +
    (isEdit ? '<button type="button" class="btn danger" id="pe-delete">Delete</button>' : '') +
    '<button type="button" class="btn primary" id="pe-save">Save</button>',
    { wide:true });
  var watcher = setInterval(function(){
    if(!document.body.contains(bg)){ clearInterval(watcher); presetEditorOpen = false; }
  }, 200);
  setTimeout(function(){
    function renderList(){
      var el = document.getElementById('pe-meds-list');
      if(!el) return;
      if(!existingMeds.length){ el.innerHTML = '<div class="muted" style="text-align:center;padding:14px;">Empty.</div>'; return; }
      el.innerHTML = existingMeds.map(function(m, i){
        return '<div style="display:flex;justify-content:space-between;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:8px 12px;margin-bottom:6px;">' +
          '<span>'+esc(m)+'</span><button type="button" class="btn xs danger" data-remove-med="'+i+'">×</button></div>';
      }).join('');
      el.querySelectorAll('[data-remove-med]').forEach(function(b){
        b.addEventListener('click', function(){ existingMeds.splice(+b.dataset.removeMed, 1); renderList(); });
      });
    }
    renderList();
    var addBtn = document.getElementById('pe-add-med');
    if(addBtn) addBtn.addEventListener('click', function(){
      var sel = document.getElementById('pe-med');
      var med = sel.value;
      if(!med || existingMeds.indexOf(med) >= 0) return;
      existingMeds.push(med);
      renderList();
    });
    var saveBtn = document.getElementById('pe-save');
    if(saveBtn) saveBtn.addEventListener('click', function(){
      var pname = document.getElementById('pe-name').value.trim();
      if(!pname || !existingMeds.length){ toast('Fill all', 'err'); return; }
      if(!db.settings.presets) db.settings.presets = {};
      if(isEdit && name !== pname) delete db.settings.presets[name];
      db.settings.presets[pname] = existingMeds.slice();
      saveDb(); bg.remove(); presetEditorOpen = false; renderView();
      toast('Saved');
    });
    var delBtn = document.getElementById('pe-delete');
    if(delBtn) delBtn.addEventListener('click', function(){
      if(!confirm('Delete?')) return;
      delete db.settings.presets[name];
      saveDb(); bg.remove(); presetEditorOpen = false; renderView();
      toast('Deleted');
    });
  }, 30);
}

/* ═══════════ SETTINGS ═══════════ */
function viewSettings(){
  var s = db.settings;
  return '<div class="grid cols-2">' +
    '<div class="card"><h3>Store Information</h3>' +
      '<div class="field"><label>Store Name</label><input id="st-name" value="'+esc(s.storeName)+'"/></div>' +
      '<div class="row">' +
        '<div class="field"><label>Subtitle</label><input id="st-sub" value="'+esc(s.storeSub||'')+'"/></div>' +
        '<div class="field"><label>Phone</label><input id="st-phone" value="'+esc(s.phone||'')+'"/></div>' +
      '</div>' +
      '<div class="field"><label>Address</label><input id="st-addr" value="'+esc(s.address||'')+'"/></div>' +
      '<div class="row">' +
        '<div class="field"><label>NTN</label><input id="st-ntn" value="'+esc(s.ntn||'')+'"/></div>' +
        '<div class="field"><label>GST</label><input id="st-gst" value="'+esc(s.gstNo||'')+'"/></div>' +
      '</div>' +
      '<div class="row">' +
        '<div class="field"><label>Currency</label><input id="st-cur" value="'+esc(s.currency||'Rs')+'"/></div>' +
        '<div class="field"><label>Low Stock Alert</label><input type="number" id="st-low" value="'+(s.lowStock||10)+'"/></div>' +
      '</div>' +
      '<div class="field"><label>Receipt Footer</label><input id="st-footer" value="'+esc(s.footer||'')+'"/></div>' +
      '<div class="divider"></div>' +
      '<div class="field"><label>Auto-send Credit Bill on WhatsApp</label>' +
        '<select id="st-auto-credit-bill">' +
          '<option value="1" '+((s.autoSendCreditBill !== false)?'selected':'')+'>✅ Yes (auto-send)</option>' +
          '<option value="0" '+((s.autoSendCreditBill === false)?'selected':'')+'>❌ No (ask first)</option>' +
        '</select>' +
        '<div class="muted" style="font-size:11px;margin-top:4px;">Credit sale ke baad customer ko bill WhatsApp pe</div>' +
      '</div>' +
      '<button type="button" class="btn primary block" id="st-save">Save Settings</button>' +
    '</div>' +
    '<div>' +
      '<div class="card"><h3>🖼 Logo</h3>' +
        '<div class="logo-preview-box">' +
          '<img id="logo-prev" class="logo-preview" src="'+(s.logo||'')+'" style="'+(s.logo?'':'display:none')+'"/>' +
          '<div class="logo-controls">' +
            '<label class="btn block" style="cursor:pointer;margin-bottom:6px;">Upload Logo<input type="file" id="logo-upload" accept="image/*" style="display:none;"/></label>' +
            (s.logo ? '<button type="button" class="btn danger block" id="logo-remove">Remove</button>' : '') +
          '</div></div>' +
      '</div>' +
      '<div class="card mt"><h3>🧾 Receipt</h3>' +
        '<div class="field"><label>Type</label><select id="st-receipt-type">' +
          '<option value="58mm" '+(s.receiptType==='58mm'?'selected':'')+'>58mm</option>' +
          '<option value="80mm" '+(s.receiptType==='80mm'?'selected':'')+'>80mm</option>' +
          '<option value="a4" '+(s.receiptType==='a4'?'selected':'')+'>A4</option>' +
        '</select></div>' +
      '</div>' +
      '<div class="card mt"><h3>💰 Tax</h3>' +
        '<div class="row">' +
          '<div class="field"><label>Enable</label><select id="st-tax-enabled">' +
            '<option value="0" '+(!s.taxEnabled?'selected':'')+'>Disabled</option>' +
            '<option value="1" '+(s.taxEnabled?'selected':'')+'>Enabled</option></select></div>' +
          '<div class="field"><label>Rate (%)</label><input type="number" id="st-tax-rate" value="'+(s.taxRate||0)+'" step="any"/></div>' +
        '</div>' +
      '</div>' +
      '<div class="card mt"><h3>☁ Cloud Sync</h3>' +
        '<div class="ledger-row"><span>Status</span><b id="st-cloud-status-text">—</b></div>' +
        '<button type="button" class="btn primary block mt" id="st-cloud-sync-now">☁ Sync Now</button>' +
        '<button type="button" class="btn block mt" id="st-cloud-restore-now">⬇ Restore from Cloud</button>' +
      '</div>' +
      '<div class="card mt"><h3>💾 Backup</h3>' +
        '<button type="button" class="btn block" id="st-backup">📥 Download JSON</button>' +
        '<label class="btn block mt" style="cursor:pointer;">📤 Restore JSON<input type="file" id="st-restore" accept=".json" style="display:none;"/></label>' +
        '<button type="button" class="btn danger block mt" id="st-reset">Reset All Data</button>' +
      '</div>' +
      '<div class="card mt"><h3>Info</h3>' +
        '<div class="muted">Version: v4.0 (Firebase + Barcode)</div>' +
        '<div class="muted">Products: '+db.products.length+'</div>' +
        '<div class="muted">Sales: '+db.sales.length+'</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

/* ═══════════ PRINT FUNCTIONS ═══════════ */
function waitForImages(container, callback){
  var imgs = container.querySelectorAll('img');
  if(!imgs.length){ setTimeout(callback, 150); return; }
  var loaded = 0, total = imgs.length, fired = false;
  function done(){ if(fired) return; fired = true; setTimeout(callback, 200); }
  imgs.forEach(function(img){
    if(img.complete && img.naturalWidth > 0){ loaded++; if(loaded === total) done(); }
    else {
      img.addEventListener('load', function(){ loaded++; if(loaded === total) done(); });
      img.addEventListener('error', function(){ loaded++; if(loaded === total) done(); });
    }
  });
  setTimeout(done, 2000);
}
function printReceipt(sale){
  try{
    var s = db.settings;
    var is58 = s.receiptType === '58mm';
    var logoHtml = '';
    if(s.printLogo !== false && s.logo){
      var size = s.printLogoSize || s.logoSize || 80;
      if(is58) size = Math.min(size, 50);
      logoHtml = '<div style="text-align:center;margin-bottom:6px;"><img src="'+s.logo+'" style="max-width:'+size+'px;max-height:'+size+'px;"/></div>';
    }
    var dateStr = new Date(sale.date).toLocaleDateString('en-GB');
    var timeStr = new Date(sale.date).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
    var itemsHtml = sale.items.map(function(i){
      var unitTxt = i.mode === 'pack' ? 'pk' : (i.unitLabel || 'u');
      var nameShort = i.name.length > 22 ? i.name.substring(0, 22) : i.name;
      return '<div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:1px;">' +
        '<span style="flex:1;">' + esc(nameShort) + ' <span style="color:#555;">x'+i.qty+' '+unitTxt+'</span></span>' +
        '<span style="text-align:right;font-weight:600;">' + i.total.toFixed(2) + '</span></div>';
    }).join('');
    var html = '<div class="receipt'+(is58?' receipt-58':' receipt-80')+'" style="font-family:\'Courier New\',monospace;padding:6px 4px;">' +
      logoHtml +
      '<div style="text-align:center;font-size:15px;font-weight:800;">' + esc(s.storeName).toUpperCase() + '</div>' +
      (s.storeSub ? '<div style="text-align:center;font-size:9px;">' + esc(s.storeSub) + '</div>' : '') +
      '<div style="text-align:center;font-size:9px;">' + esc(s.address||'') + '</div>' +
      '<div style="text-align:center;font-size:9px;">Tel: ' + esc(s.phone||'') + '</div>' +
      '<div style="border-top:1px dashed #000;margin:5px 0;"></div>' +
      '<div style="font-size:9.5px;line-height:1.5;">' +
        '<div style="display:flex;justify-content:space-between;"><span>Date:</span><span>' + dateStr + ' ' + timeStr + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;"><span>Bill #:</span><span>' + esc(sale.slipNo || sale.invoiceNo) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;"><span>Customer:</span><span>' + esc(sale.customerName || 'Walk-in') + '</span></div>' +
      '</div>' +
      '<div style="border-top:1px dashed #000;margin:5px 0;"></div>' +
      '<div style="min-height:30px;">' + itemsHtml + '</div>' +
      '<div style="border-top:1px dashed #000;margin:5px 0;"></div>' +
      '<div style="font-size:10px;">' +
        '<div style="display:flex;justify-content:space-between;"><span>Subtotal</span><span>' + (sale.subtotal||0).toFixed(2) + '</span></div>' +
        (sale.discount ? '<div style="display:flex;justify-content:space-between;"><span>Discount</span><span>- ' + sale.discount.toFixed(2) + '</span></div>' : '') +
        '<div style="display:flex;justify-content:space-between;"><span>' + esc(sale.taxLabel || 'VAT') + '</span><span>' + (sale.taxAmount||0).toFixed(2) + '</span></div>' +
      '</div>' +
      '<div style="border-top:1px dashed #000;margin:5px 0;"></div>' +
      '<div style="display:flex;justify-content:space-between;font-size:14px;font-weight:800;padding:3px 0;">' +
        '<span>TOTAL</span><span>' + s.currency + ' ' + (sale.total||0).toFixed(2) + '</span>' +
      '</div>' +
      '<div style="border-top:1px dashed #000;margin:5px 0;"></div>' +
      '<div style="font-size:9.5px;text-align:center;">Payment: ' + esc(sale.payMode) + '</div>' +
      '<div style="text-align:center;font-size:9px;margin-top:6px;font-weight:600;">' + esc(s.footer||'THANK YOU!').toUpperCase() + '</div>' +
    '</div>';
    var root = document.getElementById('print-root');
    if(!root){ root = document.createElement('div'); root.id = 'print-root'; document.body.appendChild(root); }
    root.innerHTML = html;
    waitForImages(root, function(){ try{ window.print(); }catch(err){} });
    setTimeout(function(){ root.innerHTML = ''; }, 30000);
  }catch(e){ console.error('Print:', e); }
}
function printA4Invoice(sale){
  try{
    var s = db.settings;
    var cust = findCustomer(sale.customerId) || {};
    var logoHtml = '';
    if(s.printLogo !== false && s.logo){
      var size = Math.min(Math.max(s.printLogoSize || 90, 60), 150);
      logoHtml = '<img src="'+s.logo+'" style="max-width:'+size+'px;max-height:'+size+'px;flex-shrink:0;"/>';
    }
    var itemsRows = sale.items.map(function(i, idx){
      var unitTxt = i.mode === 'pack' ? 'Pack' : (i.unitLabel || 'Unit');
      return '<tr><td>'+(idx+1)+'</td><td><b>'+esc(i.name)+'</b><br><span style="font-size:9px;color:#64748b;">B: '+esc(i.batch)+' | Exp: '+fmtDate(i.expiry)+'</span></td>' +
        '<td>'+i.qty+' '+unitTxt+'</td><td style="text-align:right;">'+money(i.unitPrice)+'</td><td style="text-align:right;">'+money(i.total)+'</td></tr>';
    }).join('');
    var isWS = sale.saleType === 'wholesale';
    var html = '<div class="invoice-a4">' +
      '<div class="inv-header"><div class="inv-brand">' + logoHtml +
        '<div class="inv-brand-text"><h1>'+esc(s.storeName)+'</h1><div>'+esc(s.address||'')+'</div><div>Ph: '+esc(s.phone||'')+'</div></div></div>' +
        '<div class="inv-meta"><strong>'+(isWS?'WHOLESALE INVOICE':'TAX INVOICE')+'</strong><br>' +
          '<div>Invoice #: <b>'+esc(sale.invoiceNo)+'</b></div>' +
          '<div>Date: '+new Date(sale.date).toLocaleDateString('en-GB')+'</div>' +
          '<div>Payment: '+esc(sale.payMode)+'</div></div>' +
      '</div>' +
      '<div class="inv-parties"><div class="inv-party"><div class="inv-party-label">Bill To</div>' +
        '<div class="inv-party-name">'+esc(sale.customerName||'Walk-in')+'</div>' +
        '<div class="inv-party-detail">' + (sale.customerPhone||cust.phone?'<div>Phone: '+esc(sale.customerPhone||cust.phone)+'</div>':'') + '</div></div>' +
        '<div class="inv-party"><div class="inv-party-label">Bill From</div>' +
        '<div class="inv-party-name">'+esc(s.storeName)+'</div>' +
        '<div class="inv-party-detail"><div>'+esc(s.address||'')+'</div><div>Ph: '+esc(s.phone||'')+'</div></div></div></div>' +
      '<table><thead><tr><th style="width:30px;">#</th><th>Description</th><th style="width:90px;">Qty</th><th style="width:90px;text-align:right;">Rate</th><th style="width:100px;text-align:right;">Amount</th></tr></thead><tbody>' + itemsRows + '</tbody></table>' +
      '<div class="inv-totals"><div class="inv-totals-box">' +
        '<div class="inv-totals-row"><span>Subtotal</span><span>'+money(sale.subtotal)+'</span></div>' +
        (sale.discount ? '<div class="inv-totals-row"><span>Discount</span><span>- '+money(sale.discount)+'</span></div>' : '') +
        (sale.taxAmount ? '<div class="inv-totals-row"><span>'+esc(sale.taxLabel||'GST')+'</span><span>+ '+money(sale.taxAmount)+'</span></div>' : '') +
        '<div class="inv-totals-row big"><span>TOTAL</span><span>'+money(sale.total)+'</span></div>' +
      '</div></div>' +
      '<div class="inv-sign"><div class="inv-sign-box">Customer Signature</div><div class="inv-sign-box">Authorized Signature</div></div>' +
    '</div>';
    var root = document.getElementById('print-root');
    if(!root){ root = document.createElement('div'); root.id = 'print-root'; document.body.appendChild(root); }
    root.innerHTML = html;
    waitForImages(root, function(){ try{ window.print(); }catch(err){} });
    setTimeout(function(){ root.innerHTML = ''; }, 30000);
  }catch(e){ console.error('A4:', e); }
}

/* ═══════════ CUSTOMER PORTAL ═══════════ */
var cpCart = [];
var cpSelectedCat = 'all';
var cpSearchQuery = '';
function openCustomerPortal(){
  cpCart = []; cpSelectedCat = 'all'; cpSearchQuery = '';
  var portal = document.getElementById('customer-portal');
  if(!portal) return;
  var storeNameEl = document.getElementById('cp-store-name');
  if(storeNameEl) storeNameEl.textContent = db.settings.storeName || 'Al-Shifa Pharmacy';
  portal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  renderCustomerPortal();
}
function closeCustomerPortal(){
  var portal = document.getElementById('customer-portal');
  if(portal) portal.style.display = 'none';
  document.body.style.overflow = '';
  cpCart = [];
}
function renderCustomerPortal(){
  var catEl = document.getElementById('cp-categories');
  if(catEl){
    var groups = getAllGroups();
    var catsInUse = groups.filter(function(g){
      return db.products.some(function(p){ return (p.group||'Other') === g.key; });
    });
    catEl.innerHTML = '<div class="cp-cat-chip '+(cpSelectedCat==='all'?'active':'')+'" data-cp-cat="all">🛍️ All</div>' +
      catsInUse.map(function(g){
        return '<div class="cp-cat-chip '+(cpSelectedCat===g.key?'active':'')+'" data-cp-cat="'+esc(g.key)+'">'+esc(g.label)+'</div>';
      }).join('');
  }
  var prodEl = document.getElementById('cp-products');
  if(prodEl){
    var list = db.products.filter(function(p){
      if(totalStock(p) <= 0) return false;
      if(cpSelectedCat !== 'all' && (p.group||'Other') !== cpSelectedCat) return false;
      if(cpSearchQuery){
        var q = cpSearchQuery.toLowerCase();
        if(p.name.toLowerCase().indexOf(q) < 0 && (p.company||'').toLowerCase().indexOf(q) < 0) return false;
      }
      return true;
    });
    if(!list.length) prodEl.innerHTML = '<div class="cp-empty" style="grid-column:1/-1;">Kuch nahi mila</div>';
    else prodEl.innerHTML = list.map(function(p){
      var b = (p.batches||[]).filter(function(x){ return x.qty > 0; }).sort(function(a,z){ return new Date(a.expiry)-new Date(z.expiry); })[0];
      var price = b ? b.mrp : 0;
      var stock = totalStock(p);
      return '<div class="cp-prod-card"><div class="cp-prod-name">'+esc(p.name)+'</div>' +
        '<div class="cp-prod-company">'+esc(p.company||'')+'</div>' +
        '<div class="cp-prod-price">'+money(price)+'</div>' +
        '<div class="cp-prod-stock">'+(stock <= 5 ? 'Sirf '+stock+' bache' : 'Available')+'</div>' +
        '<button type="button" class="cp-prod-add" data-cp-add="'+p.id+'">+ Add</button></div>';
    }).join('');
  }
  renderCpCart();
}
function renderCpCart(){
  var box = document.getElementById('cp-cart-items');
  var countEl = document.getElementById('cp-cart-count');
  var totalsEl = document.getElementById('cp-totals');
  if(countEl) countEl.textContent = cpCart.reduce(function(a,x){ return a+x.qty; }, 0) + ' items';
  if(!box) return;
  if(!cpCart.length){
    box.innerHTML = '<div class="cp-empty">Cart khali hai</div>';
  } else {
    box.innerHTML = cpCart.map(function(c, i){
      return '<div class="cp-cart-row"><div class="cp-cart-info">' +
        '<div class="cp-cart-name">'+esc(c.name)+'</div>' +
        '<div class="cp-cart-meta">'+money(c.price)+' × '+c.qty+'</div></div>' +
        '<div class="cp-cart-qty"><button type="button" data-cp-q="-1" data-cp-i="'+i+'">−</button>' +
        '<span>'+c.qty+'</span><button type="button" data-cp-q="1" data-cp-i="'+i+'">+</button></div>' +
        '<div class="cp-cart-amt">'+money(c.price * c.qty)+'</div>' +
        '<button type="button" class="cp-cart-rm" data-cp-rm="'+i+'">×</button></div>';
    }).join('');
  }
  if(totalsEl){
    var subtotal = cpCart.reduce(function(a,x){ return a + x.price * x.qty; }, 0);
    totalsEl.innerHTML = '<div class="cp-tot-row"><span>Subtotal</span><span>'+money(subtotal)+'</span></div>' +
      '<div class="cp-tot-row big"><span>TOTAL</span><span>'+money(subtotal)+'</span></div>';
  }
}
function addToCpCart(pid){
  var p = findProduct(pid);
  if(!p) return;
  var b = (p.batches||[]).filter(function(x){ return x.qty > 0; }).sort(function(a,z){ return new Date(a.expiry)-new Date(z.expiry); })[0];
  if(!b){ toast('Out of stock', 'err'); return; }
  var existing = cpCart.find(function(c){ return c.productId === pid; });
  var maxStock = totalStock(p);
  if(existing){
    if(existing.qty >= maxStock){ toast('Stock limit', 'warn'); return; }
    existing.qty++;
  } else {
    cpCart.push({ productId: pid, name: p.name, company: p.company || '', packing: p.packing || '', price: b.mrp, qty: 1 });
  }
  renderCpCart();
  toast('✓ Added');
}
function submitCustomerOrder(){
  if(!cpCart.length){ toast('Add at least 1 item', 'err'); return; }
  var nameEl = document.getElementById('cp-name');
  var phoneEl = document.getElementById('cp-phone');
  var addrEl = document.getElementById('cp-address');
  var notesEl = document.getElementById('cp-notes');
  var name = (nameEl ? nameEl.value : '').trim();
  var phone = (phoneEl ? phoneEl.value : '').trim();
  var address = (addrEl ? addrEl.value : '').trim();
  var notes = (notesEl ? notesEl.value : '').trim();
  if(!name){ toast('Naam likhein', 'err'); return; }
  if(!phone || phone.length < 7){ toast('Sahi phone number', 'err'); return; }
  if(!address){ toast('Address likhein', 'err'); return; }
  var orderId = 'CO-' + Date.now().toString(36).toUpperCase().slice(-6) + Math.random().toString(36).slice(2,4).toUpperCase();
  var subtotal = cpCart.reduce(function(a,x){ return a + x.price * x.qty; }, 0);
  var order = { id: uid('co'), orderNo: orderId, date: new Date().toISOString(),
    customerName: name, customerPhone: phone, customerAddress: address, notes: notes,
    items: JSON.parse(JSON.stringify(cpCart)), subtotal: subtotal, total: subtotal,
    status: 'new', source: 'customer-portal', seen: false };
  db.customerOrders.push(order);
  addAuditLog('Customer Order', orderId + ' · ' + name);
  saveDb();
  var s = db.settings;
  var pharmacyPhone = (s.phone || '').replace(/\D/g,'');
  if(pharmacyPhone.length === 10) pharmacyPhone = '92' + pharmacyPhone;
  if(pharmacyPhone.length === 11 && pharmacyPhone.startsWith('0')) pharmacyPhone = '92' + pharmacyPhone.substring(1);
  var waMsg = '*🛒 NAYA ORDER*\n━━━━━━━━━━━━━━━\n*' + s.storeName + '*\n\nOrder #: ' + orderId + '\n\n*👤 CUSTOMER:*\nName: ' + name + '\nPhone: ' + phone + '\nAddress: ' + address + '\n';
  if(notes) waMsg += 'Notes: ' + notes + '\n';
  waMsg += '\n*📦 ITEMS:*\n';
  cpCart.forEach(function(it, i){ waMsg += (i+1)+'. ' + it.name + ' × ' + it.qty + ' = ' + money(it.qty*it.price) + '\n'; });
  waMsg += '\n*💰 TOTAL: ' + money(subtotal) + '*';
  var portal = document.getElementById('customer-portal');
  if(portal){ portal.style.display = 'none'; document.body.style.overflow = ''; }
  if(pharmacyPhone) setTimeout(function(){ window.open('https://wa.me/' + pharmacyPhone + '?text=' + encodeURIComponent(waMsg), '_blank'); }, 300);
  addNotification('🛒 Naya Order', orderId + ' · ' + name + ' · ' + money(subtotal), 'info');
  cpCart = [];
  toast('✓ Order placed');
}

/* ═══════════ NOTIFICATIONS ═══════════ */
function initNotificationSystem(){
  var topbar = document.querySelector('.topbar');
  if(!topbar || document.getElementById('notif-btn')) return;
  var themeBtn = document.getElementById('theme-toggle');
  var bell = document.createElement('button');
  bell.type = 'button';
  bell.id = 'notif-btn';
  bell.className = 'theme-toggle notif-bell';
  bell.title = 'Notifications';
  bell.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg><span id="notif-badge" class="notif-badge" style="display:none;">0</span>';
  if(themeBtn && themeBtn.parentNode) themeBtn.parentNode.insertBefore(bell, themeBtn);
  else topbar.appendChild(bell);
  bell.addEventListener('click', openNotificationsModal);
  updateNotifBadge();
}
function timeSince(date){
  var sec = Math.floor((Date.now() - date.getTime()) / 1000);
  if(sec < 60) return 'Abhi';
  if(sec < 3600) return Math.floor(sec/60) + ' min pehle';
  if(sec < 86400) return Math.floor(sec/3600) + ' ghante pehle';
  if(sec < 604800) return Math.floor(sec/86400) + ' din pehle';
  return date.toLocaleDateString('en-GB');
}
function openNotificationsModal(){
  var notifs = db.notifications || [];
  var body = '';
  if(!notifs.length) body = '<div class="empty">🔕 Koi notification nahi.</div>';
  else {
    body = '<div style="display:flex;justify-content:flex-end;margin-bottom:10px;">' +
      '<button type="button" class="btn sm" id="notif-clear-all">🗑️ Clear All</button></div>';
    body += notifs.map(function(n){
      var color = n.type === 'warn' ? 'var(--warn)' : n.type === 'err' ? 'var(--danger)' : n.type === 'ok' ? 'var(--ok)' : 'var(--info)';
      return '<div class="ledger-row" style="padding:12px 10px;' + (!n.read ? 'background:rgba(2,132,199,.05);border-left:3px solid ' + color + ';' : 'opacity:.7;') + '">' +
        '<div style="flex:1;"><div style="font-weight:700;color:' + color + ';font-size:13px;">' + esc(n.title) + '</div>' +
        '<div style="font-size:12px;color:var(--txt2);margin-top:4px;">' + esc(n.message) + '</div>' +
        '<div class="muted" style="font-size:10.5px;margin-top:4px;">' + timeSince(new Date(n.at)) + '</div></div></div>';
    }).join('');
  }
  var bg = openModal('🔔 Notifications', body,
    '<button type="button" class="btn" data-close>Close</button>' +
    (notifs.length ? '<button type="button" class="btn primary" id="notif-mark-all">✓ Mark Read</button>' : ''),
    { wide: true });
  setTimeout(function(){
    (db.notifications || []).forEach(function(n){ n.read = true; });
    saveDb(); updateNotifBadge();
    var clearBtn = document.getElementById('notif-clear-all');
    if(clearBtn) clearBtn.addEventListener('click', function(){
      if(confirm('Clear all?')){ db.notifications = []; saveDb(); updateNotifBadge(); bg.remove(); }
    });
    var markBtn = document.getElementById('notif-mark-all');
    if(markBtn) markBtn.addEventListener('click', function(){ bg.remove(); });
  }, 50);
}

/* ═══════════ BACKUP REMINDER ═══════════ */
function checkBackupReminder(){
  if(lastBackupReminderShown) return;
  lastBackupReminderShown = 1;
  var last = lsGet('alshifa_last_backup');
  if(!last && db.sales && db.sales.length > 0){
    addNotification('💾 Backup Reminder', 'Manual backup nahi liya.', 'warn');
  }
}
function downloadBackup(){
  try{
    var blob = new Blob([JSON.stringify(db, null, 2)], { type:'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'alshifa-backup-' + todayISO() + '.json';
    a.click();
    lsSet('alshifa_last_backup', String(Date.now()));
    toast('Backup downloaded');
  }catch(e){ toast('Backup failed', 'err'); }
}

/* ═══════════ CAMERA SCANNER ═══════════ */
function openCameraScanner(onScanned){
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    toast('Camera not supported', 'err'); return;
  }
  var modal = document.createElement('div');
  modal.id = 'camera-scanner-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:#000;z-index:9999999;display:flex;flex-direction:column;';
  modal.innerHTML = '<div style="padding:14px;background:#111;color:#fff;display:flex;justify-content:space-between;align-items:center;">' +
      '<b>📷 Barcode Scan</b>' +
      '<button id="cs-close" style="background:#dc2626;color:#fff;border:none;padding:8px 14px;border-radius:8px;font-weight:700;cursor:pointer;">✕ Close</button></div>' +
    '<div style="flex:1;position:relative;"><video id="cs-video" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover;"></video>' +
      '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:80%;max-width:400px;height:120px;border:3px solid #10b981;border-radius:12px;box-shadow:0 0 20px rgba(16,185,129,.5);"></div>' +
      '<div id="cs-status" style="position:absolute;bottom:20px;left:20px;right:20px;text-align:center;color:#fff;font-size:14px;font-weight:600;text-shadow:0 2px 8px #000;">Camera start...</div></div>';
  document.body.appendChild(modal);
  var video = document.getElementById('cs-video');
  var status = document.getElementById('cs-status');
  var stream = null;
  var scanning = true;
  document.getElementById('cs-close').onclick = function(){
    scanning = false;
    if(stream) stream.getTracks().forEach(function(t){ t.stop(); });
    modal.remove();
  };
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(function(s){
    stream = s;
    video.srcObject = s;
    status.textContent = '📸 Barcode ko box mein rakhein';
    if('BarcodeDetector' in window){
      var detector = new window.BarcodeDetector({ formats: ['code_128','code_39','ean_13','ean_8','upc_a','upc_e','qr_code'] });
      var scanInterval = setInterval(function(){
        if(!scanning || video.readyState !== 4) return;
        detector.detect(video).then(function(barcodes){
          if(barcodes && barcodes.length > 0){
            var code = barcodes[0].rawValue;
            clearInterval(scanInterval);
            scanning = false;
            if(stream) stream.getTracks().forEach(function(t){ t.stop(); });
            modal.remove();
            if(navigator.vibrate) navigator.vibrate(100);
            if(typeof onScanned === 'function') onScanned(code);
          }
        }).catch(function(){});
      }, 300);
    } else {
      status.textContent = '⚠ Browser scan support nahi. Manually likhein.';
      setTimeout(function(){ modal.remove(); }, 3000);
    }
  }).catch(function(err){
    status.textContent = '❌ Camera fail: ' + err.message;
    setTimeout(function(){ modal.remove(); }, 3000);
  });
}

/* ═══════════ GLOBAL EVENTS ═══════════ */
document.addEventListener('click', function(e){
  if(e.target.closest('#menu-toggle')){ var sb = $('#sidebar'); if(sb) sb.classList.toggle('open'); return; }
  if(e.target.closest('#logout-btn')){ doLogout(); return; }
  var nav = e.target.closest('[data-nav]');
  if(nav){ navigateTo(nav.dataset.nav); return; }

  var cf = e.target.closest('[data-filter-cust]');
  if(cf){
    $$('[data-filter-cust]').forEach(function(b){ b.classList.remove('active-primary'); });
    cf.classList.add('active-primary');
    var list = db.customers.filter(function(c){ return c.id !== 'c1'; });
    var w = $('#cust-wrap');
    if(w) w.innerHTML = custTable(list, cf.dataset.filterCust);
    return;
  }
  var sf = e.target.closest('[data-sales-filter]');
  if(sf){
    $$('[data-sales-filter]').forEach(function(b){ b.classList.remove('active-primary'); });
    sf.classList.add('active-primary');
    var all = (db.sales||[]).slice().reverse();
    var w2 = $('#sales-wrap');
    if(w2) w2.innerHTML = salesTable(all, sf.dataset.salesFilter);
    return;
  }
  var ef = e.target.closest('[data-expiry-filter]');
  if(ef){
    $$('[data-expiry-filter]').forEach(function(b){ b.classList.remove('active-primary'); });
    ef.classList.add('active-primary');
    renderExpiryTable(ef.dataset.expiryFilter);
    return;
  }
  if(e.target.id === 'expiry-print'){
    var tbl = document.querySelector('#expiry-wrap table');
    if(!tbl){ toast('Koi data nahi', 'warn'); return; }
    var html = '<h2 style="text-align:center;">' + esc(db.settings.storeName) + '</h2><h3 style="text-align:center;">Expiry Report</h3>';
    html += '<table width="100%" border="1" style="border-collapse:collapse;font-size:11px;">';
    tbl.querySelectorAll('tbody tr').forEach(function(r){
      var cells = r.querySelectorAll('td');
      if(cells.length < 5) return;
      html += '<tr>';
      for(var i=0; i<5; i++) html += '<td style="padding:4px;">' + cells[i].innerText.trim() + '</td>';
      html += '</tr>';
    });
    html += '</table>';
    var w = window.open('', '_blank');
    w.document.write('<html><head><title>Expiry</title></head><body>' + html + '</body></html>');
    w.document.close();
    setTimeout(function(){ w.print(); }, 300);
    return;
  }
  if(e.target.id === 'audit-export'){
    var csv = 'Time,User,Action,Details\n';
    (db.auditLog||[]).forEach(function(l){ csv += '"' + l.at + '","' + (l.user||'') + '","' + (l.action||'') + '","' + (l.detail||'') + '"\n'; });
    var blob = new Blob(['\ufeff' + csv], {type:'text/csv'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'audit-log-' + todayISO() + '.csv';
    a.click();
    return;
  }
  if(e.target.id === 'audit-clear'){
    if(confirm('Clear audit log?')){ db.auditLog = []; saveDb(); renderView(); toast('Cleared'); }
    return;
  }

  if(e.target.id === 'public-place-order-btn'){ openCustomerPortal(); return; }
  if(e.target.id === 'cp-close-btn'){ closeCustomerPortal(); return; }
  if(e.target.id === 'cp-submit'){ submitCustomerOrder(); return; }
  if(e.target.id === 'co-test-open'){ openCustomerPortal(); return; }
  var cpCat = e.target.closest('[data-cp-cat]');
  if(cpCat){ cpSelectedCat = cpCat.dataset.cpCat; renderCustomerPortal(); return; }
  var cpAdd = e.target.closest('[data-cp-add]');
  if(cpAdd){ addToCpCart(cpAdd.dataset.cpAdd); return; }
  var cpRm = e.target.closest('[data-cp-rm]');
  if(cpRm){ cpCart.splice(+cpRm.dataset.cpRm, 1); renderCpCart(); return; }
  var cpQ = e.target.closest('[data-cp-q]');
  if(cpQ){
    var idx = +cpQ.dataset.cpI, d = +cpQ.dataset.cpQ;
    var c = cpCart[idx];
    if(!c) return;
    if(d < 0){ c.qty--; if(c.qty <= 0) cpCart.splice(idx, 1); }
    else {
      var prod = findProduct(c.productId);
      var maxS = prod ? totalStock(prod) : 999;
      if(c.qty >= maxS){ toast('Stock limit', 'warn'); return; }
      c.qty++;
    }
    renderCpCart();
    return;
  }
});

document.addEventListener('input', function(e){
  if(e.target.id === 'audit-search'){
    var wrap = $('#audit-wrap');
    if(wrap) wrap.innerHTML = auditTable((db.auditLog||[]).slice().reverse(), e.target.value);
  }
  if(e.target.id === 'cp-search'){
    cpSearchQuery = e.target.value;
    clearTimeout(window.__cpSearchTimer);
    window.__cpSearchTimer = setTimeout(function(){ renderCustomerPortal(); }, 200);
  }
});

/* ═══════════ ACTION DELEGATION ═══════════ */
document.addEventListener('click', function(e){
  var t = e.target.closest('[data-action]');
  if(!t) return;
  var act = t.dataset.action, id = t.dataset.id;
  try{
    switch(act){
      case 'place-order': openPlaceOrderModal(); break;
      case 'po-send-wa': sendSupplierPOWhatsApp(id); break;
      case 'po-print-supplier': printSupplierPO(id); break;
      case 'po-view': openPOViewModal(id); break;
      case 'po-receive': receivePO(id); break;
      case 'co-view': openCustomerOrderView(id); break;
      case 'co-confirm': confirmCustomerOrder(id); break;
      case 'co-deliver': deliverCustomerOrder(id); break;
      case 'co-print-slip': printDeliverySlip(id); break;
      case 'co-cancel': if(confirm('Cancel?')) cancelCustomerOrder(id); break;
      case 'co-wa': whatsappCustomerOrder(id); break;
      case 'po-cancel':
        if(confirm('Cancel PO?')){
          var po = (db.purchaseOrders||[]).find(function(p){ return p.id === id; });
          if(po){ po.status = 'cancelled'; saveDb(); renderView(); toast('Cancelled'); }
        }
        break;
      case 'po-mark-sent':
        var po2 = (db.purchaseOrders||[]).find(function(p){ return p.id === id; });
        if(po2){ po2.status = 'sent'; po2.sentAt = new Date().toISOString(); saveDb(); renderView(); }
        break;
      case 'add-category': openAddCategoryModal(); break;
      case 'barcode': openBarcodeModal(findProduct(id)); break;
      case 'add-product': openProductModal(null); break;
      case 'edit-product': openProductModal(findProduct(id)); break;
      case 'add-batch': openBatchModal(findProduct(id)); break;
      case 'del-product':
        if(confirm('Delete product?')){
          var dprod = findProduct(id);
          db.products = db.products.filter(function(p){ return p.id !== id; });
          addAuditLog('Product Deleted', dprod ? dprod.name : id);
          saveDb(); renderView(); toast('Deleted');
        }
        break;
      case 'add-purchase': openPurchaseModal(); break;
      case 'new-return': openReturnModal(); break;
      case 'add-customer': openCustomerModal(null); break;
      case 'edit-customer': openCustomerModal(findCustomer(id)); break;
      case 'del-customer':
        if(confirm('Delete customer?')){
          db.customers = db.customers.filter(function(c){ return c.id !== id; });
          if(selectedCustomer === id) selectedCustomer = 'c1';
          saveDb(); renderView(); toast('Deleted');
        }
        break;
      case 'view-ledger': openLedgerModal(findCustomer(id)); break;
      case 'new-tx': openTransactionModal(findCustomer(id)); break;
      case 'send-bill':
        var cust2 = findCustomer(id);
        if(cust2) sendCreditBillWhatsApp(cust2, null);
        break;
      case 'send-sale-bill':
        var sale3 = db.sales.find(function(s){ return s.id === id; });
        if(sale3){
          var cust3 = findCustomer(sale3.customerId);
          if(cust3) sendCreditBillWhatsApp(cust3, sale3);
        }
        break;
      case 'add-supplier': openSupplierModal(null); break;
      case 'edit-supplier': openSupplierModal(findSupplier(id)); break;
      case 'del-supplier':
        if(confirm('Delete supplier?')){
          db.suppliers = db.suppliers.filter(function(s){ return s.id !== id; });
          saveDb(); renderView(); toast('Deleted');
        }
        break;
      case 'view-supplier-ledger': openSupplierLedger(findSupplier(id)); break;
      case 'supplier-pay': openSupplierPay(findSupplier(id)); break;
      case 'print-sale':
        var sale = db.sales.find(function(s){ return s.id === id; });
        if(sale){ if(sale.saleType === 'wholesale') printA4Invoice(sale); else printReceipt(sale); }
        break;
      case 'del-sale':
        if(confirm('Delete sale?')){
          var sl = db.sales.find(function(x){ return x.id === id; });
          if(sl){
            sl.items.forEach(function(it){
              var p = findProduct(it.productId);
              if(!p) return;
              var b = p.batches.find(function(x){ return x.id === it.batchId; });
              if(b){ var units = it.mode === 'pack' ? it.qty * p.packSize : it.qty; b.qty += units; }
            });
            db.sales = db.sales.filter(function(x){ return x.id !== id; });
            saveDb(); renderView(); toast('Deleted');
          }
        }
        break;
      case 'add-staff': openStaffModal(null); break;
      case 'edit-staff': openStaffModal((db.staff||[]).find(function(s){ return s.id === id; })); break;
      case 'del-staff':
        if(confirm('Delete staff?')){
          db.staff = db.staff.filter(function(s){ return s.id !== id; });
          saveDb(); renderView();
        }
        break;
      case 'new-preset': openPresetEditor(null); break;
      case 'edit-preset': openPresetEditor(t.dataset.name); break;
      case 'del-preset':
        if(confirm('Delete?')){
          delete db.settings.presets[t.dataset.name];
          saveDb(); renderView(); toast('Deleted');
        }
        break;
    }
  }catch(err){ console.error('Action error:', err); toast('Error: '+err.message, 'err'); }
});

function openAddCategoryModal(){
  var body = '<div class="field"><label>Category Name *</label><input id="nc-name" autofocus/></div>' +
    '<div class="field"><label>Short Code</label><input id="nc-short" maxlength="2"/></div>';
  var bg = openModal('Add Category', body,
    '<button type="button" class="btn" data-close>Cancel</button>' +
    '<button type="button" class="btn primary" id="nc-save">Create</button>');
  setTimeout(function(){
    var btn = document.getElementById('nc-save');
    if(!btn) return;
    btn.addEventListener('click', function(){
      var name = document.getElementById('nc-name').value.trim();
      if(!name){ toast('Name required', 'err'); return; }
      var short = (document.getElementById('nc-short').value.trim() || name.substring(0,2)).toUpperCase();
      makeCustomGroup(name);
      addAuditLog('Category Added', name);
      saveDb(); bg.remove(); renderView();
      toast('✓ Created');
    });
  }, 30);
}

/* ═══════════ SETTINGS EVENTS ═══════════ */
document.addEventListener('click', function(e){
  if(e.target.id === 'st-save'){
    var s = db.settings;
    s.storeName = $('#st-name').value.trim() || s.storeName;
    s.storeSub = $('#st-sub').value.trim();
    s.address = $('#st-addr').value.trim();
    s.phone = $('#st-phone').value.trim();
    s.ntn = $('#st-ntn').value.trim();
    s.gstNo = $('#st-gst').value.trim();
    s.currency = $('#st-cur').value.trim() || 'Rs';
    s.lowStock = +$('#st-low').value || 10;
    s.footer = $('#st-footer').value.trim();
    s.receiptType = $('#st-receipt-type').value;
    s.taxEnabled = $('#st-tax-enabled').value === '1';
    s.taxRate = +$('#st-tax-rate').value || 0;
    var abc = $('#st-auto-credit-bill');
    if(abc) s.autoSendCreditBill = abc.value === '1';
    addAuditLog('Settings Updated', 'Saved');
    saveDb(); renderView();
    $('#brand-name').textContent = s.storeName;
    $('#top-store').textContent = s.storeName;
    toast('Settings saved');
  }
  if(e.target.id === 'st-cloud-sync-now'){ forceCloudSync(); return; }
  if(e.target.id === 'st-cloud-restore-now'){ forceCloudRestore(); return; }
  if(e.target.id === 'st-backup') downloadBackup();
  if(e.target.id === 'st-reset'){
    if(confirm('Reset ALL data?')){
      if(confirm('Pakka?')){ lsRemove(LS_KEY); lsRemove(LEGACY_LS_KEY); location.reload(); }
    }
  }
  if(e.target.id === 'logo-remove'){ db.settings.logo = ''; saveDb(); renderView(); toast('Logo removed'); }
  if(e.target.id === 'dc-save'){
    var counted = +$('#dc-counted').value || 0;
    var date = todayISO();
    var sales = db.sales.filter(function(s){ return s.date.slice(0,10) === date; });
    var byMode = { Cash:0, Card:0, Credit:0 };
    sales.forEach(function(s){ byMode[s.payMode] = (byMode[s.payMode]||0) + s.total; });
    var record = { date: date, closedAt: new Date().toISOString(),
      gross: sales.reduce(function(a,s){ return a+s.total; }, 0),
      cash: byMode.Cash, card: byMode.Card, credit: byMode.Credit,
      expectedCash: byMode.Cash, counted: counted,
      difference: counted - byMode.Cash, invoiceCount: sales.length };
    if(!db.dayCloses) db.dayCloses = [];
    var existingIdx = db.dayCloses.findIndex(function(d){ return d.date === date; });
    if(existingIdx >= 0) db.dayCloses[existingIdx] = record;
    else db.dayCloses.push(record);
    addAuditLog('Day Closed', date + ' · Diff: ' + money(record.difference));
    saveDb(); renderView();
    toast('Day closed · Diff: ' + money(record.difference));
  }
  if(e.target.id === 'rp-run') runReport();
});

document.addEventListener('change', function(e){
  if(e.target.id === 'logo-upload' && e.target.files[0]){
    var file = e.target.files[0];
    if(file.size > 500 * 1024){ toast('Image 500KB se chhoti', 'err'); return; }
    var r = new FileReader();
    r.onload = function(ev){
      db.settings.logo = ev.target.result;
      saveDb(); renderView();
      toast('Logo uploaded');
    };
    r.readAsDataURL(file);
  }
  if(e.target.id === 'st-restore' && e.target.files[0]){
    var r2 = new FileReader();
    r2.onload = function(ev){
      try{
        var d = JSON.parse(ev.target.result);
        if(!d.settings || !d.products) throw new Error('bad file');
        db = d;
        saveDb(); location.reload();
      }catch(err){ toast('Invalid file', 'err'); }
    };
    r2.readAsText(e.target.files[0]);
  }
});

/* ═══════════ INIT ═══════════ */
function init(){
  try{
    console.log('[INIT] v4.0 (Firebase Auth + Barcode)');
    db = loadDb();
    if(!db.auditLog) db.auditLog = [];
    if(!db.purchaseOrders) db.purchaseOrders = [];
    if(!db.customerOrders) db.customerOrders = [];
    if(!db.notifications) db.notifications = [];
    if(!db.settings.customGroups) db.settings.customGroups = [];
    // Ensure all products have barcode
    db.products.forEach(function(p){ if(!p.barcode) p.barcode = generateAutoBarcode(); });
    saveDb();

    initThemeToggle();
    initKeyboardShortcuts();
    initNotificationSystem();
    setupForgotPasswordButton();

    function startWithAuth(){
      if(!window.FirebaseReady || !window.FirebaseAuth || !window.FirebaseFuncs || !window.FirebaseFuncs.onAuthStateChanged){
        console.warn('⚠ Firebase Auth not ready — offline mode');
        showLoginScreen();
        initLoginFirebase();
        return;
      }
      window.FirebaseFuncs.onAuthStateChanged(window.FirebaseAuth, function(firebaseUser){
        if(firebaseUser){
          console.log('✓ Signed in:', firebaseUser.email);
          var savedSession = loadSession();
          if(savedSession && savedSession.user){
            loggedIn = true;
            currentUserData = savedSession.user;
            showAppScreen();
          } else {
            var userData = {
              name: firebaseUser.displayName || firebaseUser.email.split('@')[0],
              role: 'owner', u: firebaseUser.email, email: firebaseUser.email,
              uid: firebaseUser.uid, modules: null
            };
            loggedIn = true;
            currentUserData = userData;
            saveSession(userData);
            addAuditLog('Login', 'Logged in: ' + firebaseUser.email);
            saveDb();
            showAppScreen();
            toast('✓ Welcome, ' + userData.name);
          }
        } else {
          if(loggedIn) performCleanLocalLogout();
          loggedIn = false;
          currentUserData = null;
          showLoginScreen();
        }
      });
      initLoginFirebase();
    }

    if(window.FirebaseReady) startWithAuth();
    else {
      window.addEventListener('firebase-ready', startWithAuth, { once: true });
      setTimeout(function(){ if(!loggedIn && !window.FirebaseAuth) startWithAuth(); }, 5000);
    }

    updateCloudBadge();
    console.log('[INIT] Ready');
  }
  catch(e){
    console.error('[INIT] Fatal:', e);
    document.body.innerHTML = '<div style="padding:40px;"><h1 style="color:#dc2626;">Startup Error</h1><pre>' + (e.message || e) + '</pre><button onclick="location.reload()">Retry</button></div>';
  }
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

/* ═══════════ EXPORT ═══════════ */
window.openCameraScanner = openCameraScanner;
window.generateBarcodeSVG = generateBarcodeSVG;
window.openBarcodeModal = openBarcodeModal;
window.printBulkBarcodes = printBulkBarcodes;
window.sendCreditBillWhatsApp = sendCreditBillWhatsApp;

/* ═══════════ END v4.0 ═══════════ */