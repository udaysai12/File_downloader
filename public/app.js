/* ══════════════════════════════════════════
   MediaPull — Frontend Logic
   ══════════════════════════════════════════ */

const API = '';  // same-origin

// ── DOM refs ──────────────────────────────
const urlInput      = document.getElementById('urlInput');
const fetchBtn      = document.getElementById('fetchBtn');
const pasteBtn      = document.getElementById('pasteBtn');
const mediaCard     = document.getElementById('mediaCard');
const progressCard  = document.getElementById('progressCard');
const historyCard   = document.getElementById('historyCard');
const historyBtn    = document.getElementById('historyBtn');
const clearHistBtn  = document.getElementById('clearHistoryBtn');
const downloadBtn   = document.getElementById('downloadBtn');
const toastContainer= document.getElementById('toastContainer');

// Media info
const mediaThumbnail  = document.getElementById('mediaThumbnail');
const thumbPlaceholder= document.getElementById('thumbPlaceholder');
const mediaDuration   = document.getElementById('mediaDuration');
const mediaUploader   = document.getElementById('mediaUploader');
const mediaTitle      = document.getElementById('mediaTitle');

// Progress
const progressIcon    = document.getElementById('progressIcon');
const progressTitle   = document.getElementById('progressTitle');
const progressSubtitle= document.getElementById('progressSubtitle');
const progressFill    = document.getElementById('progressFill');
const progressPercent = document.getElementById('progressPercent');
const progressStats   = document.getElementById('progressStats');
const statSpeed       = document.getElementById('statSpeed');
const statSize        = document.getElementById('statSize');
const statEta         = document.getElementById('statEta');

// Format tabs
const tabVideo        = document.getElementById('tabVideo');
const tabAudio        = document.getElementById('tabAudio');
const videoQualities  = document.getElementById('videoQualities');
const audioQualities  = document.getElementById('audioQualities');

// History
const historyList     = document.getElementById('historyList');

// ── State ─────────────────────────────────
let currentMediaInfo = null;
let activeTab = 'video';

// ── Init ──────────────────────────────────
loadHistory();

// ── Paste button ──────────────────────────
pasteBtn.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      urlInput.value = text.trim();
      urlInput.focus();
      toast('Pasted from clipboard', 'info');
    }
  } catch (_) {
    toast('Cannot access clipboard', 'error');
  }
});

// ── URL input: Enter key ──────────────────
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') fetchBtn.click();
});

// ── Fetch media info ──────────────────────
fetchBtn.addEventListener('click', async () => {
  const url = urlInput.value.trim();
  if (!url) { toast('Please enter a URL', 'error'); return; }

  setFetchLoading(true);
  mediaCard.hidden = true;
  progressCard.hidden = true;

  try {
    const res = await fetch(`${API}/api/info?url=${encodeURIComponent(url)}`);
    const data = await res.json();

    if (!res.ok) {
      toast(data.error || 'Failed to fetch media info', 'error');
      return;
    }

    currentMediaInfo = data;
    renderMediaInfo(data);
    mediaCard.hidden = false;
    mediaCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (err) {
    toast('Network error — is the server running?', 'error');
  } finally {
    setFetchLoading(false);
  }
});

function setFetchLoading(loading) {
  fetchBtn.disabled = loading;
  fetchBtn.querySelector('.btn-text').hidden = loading;
  fetchBtn.querySelector('.btn-loader').hidden = !loading;
}

function renderMediaInfo(data) {
  // Thumbnail
  if (data.thumbnail) {
    mediaThumbnail.src = data.thumbnail;
    mediaThumbnail.onload = () => {
      mediaThumbnail.classList.add('loaded');
      thumbPlaceholder.hidden = true;
    };
    mediaThumbnail.onerror = () => {
      mediaThumbnail.classList.remove('loaded');
      thumbPlaceholder.hidden = false;
    };
  } else {
    mediaThumbnail.classList.remove('loaded');
    thumbPlaceholder.hidden = false;
    thumbPlaceholder.innerHTML = data.isDirectFile ? '<i class="fa-solid fa-folder-open"></i>' : '<i class="fa-solid fa-clapperboard"></i>';
  }

  // Duration
  if (data.duration) {
    mediaDuration.textContent = formatDuration(data.duration);
    mediaDuration.hidden = false;
  } else {
    mediaDuration.hidden = true;
  }

  mediaUploader.textContent = data.uploader || '';
  mediaTitle.textContent = data.title || 'Unknown';

  // If it's a direct file, limit format options
  if (data.isDirectFile) {
    const ext = data.directExt || '';
    const isAudio = ['mp3', 'wav', 'm4a', 'flac', 'ogg'].includes(ext);
    if (isAudio) switchTab('audio');
    else switchTab('video');
  }
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

// ── Format Tabs ───────────────────────────
tabVideo.addEventListener('click', () => switchTab('video'));
tabAudio.addEventListener('click', () => switchTab('audio'));

function switchTab(tab) {
  activeTab = tab;
  tabVideo.classList.toggle('active', tab === 'video');
  tabAudio.classList.toggle('active', tab === 'audio');
  tabVideo.setAttribute('aria-selected', tab === 'video');
  tabAudio.setAttribute('aria-selected', tab === 'audio');
  videoQualities.hidden = tab !== 'video';
  audioQualities.hidden = tab !== 'audio';

  // Set default checked
  const grid = tab === 'video' ? videoQualities : audioQualities;
  const radios = grid.querySelectorAll('input[type="radio"]');
  const hasChecked = Array.from(radios).some(r => r.checked);
  if (!hasChecked && radios.length > 0) radios[1].checked = true;
}

// ── Download ──────────────────────────────
downloadBtn.addEventListener('click', async () => {
  if (!currentMediaInfo) return;

  const selectedRadio = document.querySelector('input[name="quality"]:checked');
  if (!selectedRadio) { toast('Please select a quality', 'error'); return; }

  const value = selectedRadio.value;
  const payload = buildPayload(value, currentMediaInfo);

  downloadBtn.disabled = true;
  document.getElementById('downloadBtnText').textContent = 'Starting…';

  try {
    const res = await fetch(`${API}/api/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const { jobId } = await res.json();

    progressCard.hidden = false;
    progressCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    listenProgress(jobId, currentMediaInfo.title);

  } catch (err) {
    toast('Failed to start download', 'error');
    downloadBtn.disabled = false;
    document.getElementById('downloadBtnText').textContent = 'Download';
  }
});

function buildPayload(value, info) {
  const base = { url: info.webpage_url || info.url || urlInput.value.trim() };

  if (info.isDirectFile) {
    return { ...base, isDirectFile: true };
  }

  if (value === 'video_1080') return { ...base, type: 'video', format: 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best[height<=1080]' };
  if (value === 'video_720')  return { ...base, type: 'video', format: 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[height<=720]' };
  if (value === 'video_480')  return { ...base, type: 'video', format: 'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best[height<=480]' };
  if (value === 'video_360')  return { ...base, type: 'video', format: 'bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360][ext=mp4]/best[height<=360]' };
  if (value === 'audio_mp3_320') return { ...base, type: 'audio', format: 'bestaudio/best', ext: 'mp3', audioQuality: '0' };
  if (value === 'audio_mp3_192') return { ...base, type: 'audio', format: 'bestaudio/best', ext: 'mp3', audioQuality: '5' };
  if (value === 'audio_mp3_128') return { ...base, type: 'audio', format: 'bestaudio/best', ext: 'mp3', audioQuality: '9' };
  if (value === 'audio_wav')     return { ...base, type: 'audio', format: 'bestaudio/best', ext: 'wav', audioQuality: '0' };
  if (value === 'audio_m4a')     return { ...base, type: 'audio', format: 'bestaudio[ext=m4a]/bestaudio', ext: 'm4a', audioQuality: '0' };

  return { ...base, type: 'video', format: 'best' };
}

// ── SSE Progress listener ─────────────────
function listenProgress(jobId, title) {
  setProgressUI({ status: 'starting', percent: 0, message: 'Connecting…' });

  const evtSource = new EventSource(`${API}/api/progress/${jobId}`);

  evtSource.onmessage = (e) => {
    const data = JSON.parse(e.data);
    setProgressUI(data);

    if (data.status === 'complete') {
      evtSource.close();
      // Auto-trigger download
      const a = document.createElement('a');
      a.href = data.downloadUrl;
      a.download = data.filename || 'download';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      toast('Download complete! ✨', 'success');
      addToHistory({ title, filename: data.filename, status: 'success', type: activeTab });
      downloadBtn.disabled = false;
      document.getElementById('downloadBtnText').textContent = 'Download';
    }

    if (data.status === 'error') {
      evtSource.close();
      toast(data.message || 'Download failed', 'error');
      addToHistory({ title, filename: '', status: 'error', type: activeTab });
      downloadBtn.disabled = false;
      document.getElementById('downloadBtnText').textContent = 'Download';
    }
  };

  evtSource.onerror = () => {
    evtSource.close();
    setProgressUI({ status: 'error', message: 'Connection lost. Check server.' });
    downloadBtn.disabled = false;
    document.getElementById('downloadBtnText').textContent = 'Download';
  };
}

function setProgressUI({ status, percent = 0, message = '', speed, size, eta }) {
  const iconMap = {
    starting:    '<i class="fa-solid fa-hourglass-half"></i>',
    downloading: '<i class="fa-solid fa-download"></i>',
    processing:  '<i class="fa-solid fa-gear fa-spin"></i>',
    complete:    '<i class="fa-solid fa-circle-check"></i>',
    error:       '<i class="fa-solid fa-circle-xmark"></i>',
    log:         progressIcon.innerHTML
  };

  progressIcon.innerHTML = iconMap[status] || '<i class="fa-solid fa-hourglass-half"></i>';

  const titleMap = {
    starting: 'Initializing…',
    downloading: 'Downloading…',
    processing: 'Processing…',
    complete: 'Complete!',
    error: 'Download Failed',
    log: progressTitle.textContent
  };
  progressTitle.textContent = titleMap[status] || 'Working…';

  if (status !== 'log') {
    progressFill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    progressPercent.textContent = `${Math.round(percent)}%`;
  }

  if (message && status !== 'log') {
    progressSubtitle.textContent = message;
  }

  if (status === 'downloading' && (speed || size)) {
    progressStats.hidden = false;
    if (speed) statSpeed.textContent = speed;
    if (size) statSize.textContent = size;
    if (eta !== undefined) statEta.textContent = eta || '—';
  }

  if (status === 'complete') {
    progressIcon.style.animation = 'none';
    progressFill.style.width = '100%';
    progressPercent.textContent = '100%';
  }
}

// ── History ───────────────────────────────
function addToHistory(item) {
  const history = getHistory();
  history.unshift({ ...item, date: new Date().toISOString() });
  if (history.length > 50) history.pop();
  localStorage.setItem('mediapull_history', JSON.stringify(history));
  renderHistory();
}

function getHistory() {
  try { return JSON.parse(localStorage.getItem('mediapull_history') || '[]'); }
  catch (_) { return []; }
}

function loadHistory() { renderHistory(); }

function renderHistory() {
  const history = getHistory();
  if (history.length === 0) {
    historyList.innerHTML = '<li class="history-empty">No downloads yet</li>';
    return;
  }

  historyList.innerHTML = history.map((item, i) => `
    <li class="history-item" data-index="${i}">
      <span class="history-item-icon">${item.type === 'audio' ? '<i class="fa-solid fa-music"></i>' : '<i class="fa-solid fa-film"></i>'}</span>
      <div class="history-item-info">
        <div class="history-item-title">${escapeHtml(item.title || 'Unknown')}</div>
        <div class="history-item-meta">${formatDate(item.date)} · ${item.filename || ''}</div>
      </div>
      <span class="history-item-badge ${item.status === 'success' ? 'badge-success' : 'badge-error'}">
        ${item.status === 'success' ? '✓ Done' : '✗ Failed'}
      </span>
    </li>
  `).join('');
}

clearHistBtn.addEventListener('click', () => {
  localStorage.removeItem('mediapull_history');
  renderHistory();
  toast('History cleared', 'info');
});

historyBtn.addEventListener('click', () => {
  const isHidden = historyCard.hidden;
  historyCard.hidden = !isHidden;
  historyBtn.classList.toggle('active', !isHidden);
  if (!isHidden) return;
  renderHistory();
  historyCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

// ── Toast ─────────────────────────────────
function toast(message, type = 'info') {
  const icons = { success: '<i class="fa-solid fa-check"></i>', error: '<i class="fa-solid fa-xmark"></i>', info: '<i class="fa-solid fa-circle-info"></i>' };
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span>${icons[type]}</span><span>${escapeHtml(message)}</span>`;
  toastContainer.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ── Helpers ───────────────────────────────
function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
