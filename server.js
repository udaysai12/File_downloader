const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// ─────────────────────────────────────────────
// Resolve binary paths (yt-dlp & ffmpeg)
// Checks: 1) local ./bin/  2) pip Scripts  3) system PATH
// ─────────────────────────────────────────────
function resolveBinary(name) {
  const isWin = process.platform === 'win32';
  const exe = isWin ? `${name}.exe` : name;

  // 1. Local ./bin/ folder (bundled)
  const localBin = path.join(__dirname, 'bin', exe);
  if (fs.existsSync(localBin)) return localBin;

  // 2. pip user Scripts directory (Python 3.x)
  const pipDirs = [
    path.join(os.homedir(), 'AppData', 'Roaming', 'Python', 'Python314', 'Scripts', exe),
    path.join(os.homedir(), 'AppData', 'Roaming', 'Python', 'Python313', 'Scripts', exe),
    path.join(os.homedir(), 'AppData', 'Roaming', 'Python', 'Python312', 'Scripts', exe),
    path.join(os.homedir(), 'AppData', 'Roaming', 'Python', 'Python311', 'Scripts', exe),
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python314', 'Scripts', exe),
  ];
  for (const p of pipDirs) {
    if (fs.existsSync(p)) return p;
  }

  // 3. Fallback to system PATH
  return name;
}

const YTDLP_BIN  = resolveBinary('yt-dlp');
const FFMPEG_BIN = resolveBinary('ffmpeg');

console.log(`yt-dlp  → ${YTDLP_BIN}`);
console.log(`ffmpeg  → ${FFMPEG_BIN}`);

// Create downloads directory
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Store active SSE connections
const sseClients = new Map();

// ─────────────────────────────────────────────
// GET /api/info  – fetch video metadata
// ─────────────────────────────────────────────
app.get('/api/info', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  const args = [
    '--dump-json',
    '--no-playlist',
    '--no-warnings',
    url
  ];

  const ytdlp = spawn(YTDLP_BIN, args);
  let stdout = '';
  let stderr = '';
  let responded = false;

  // Handle yt-dlp not installed
  ytdlp.on('error', (err) => {
    if (responded) return;
    responded = true;
    if (err.code === 'ENOENT') {
      return res.status(503).json({
        error: 'yt-dlp is not installed or not in PATH.',
        detail: 'Download yt-dlp from https://github.com/yt-dlp/yt-dlp/releases and add it to your system PATH.'
      });
    }
    return res.status(500).json({ error: 'Spawn error', detail: err.message });
  });

  ytdlp.stdout.on('data', (d) => (stdout += d.toString()));
  ytdlp.stderr.on('data', (d) => (stderr += d.toString()));

  ytdlp.on('close', (code) => {
    if (responded) return;
    responded = true;
    if (code !== 0) {
      // Try direct file URL fallback
      try {
        const parsedUrl = new URL(url);
        const filename = path.basename(parsedUrl.pathname);
        const ext = path.extname(filename).replace('.', '').toLowerCase();
        if (['mp4', 'mp3', 'wav', 'webm', 'mkv', 'avi', 'mov', 'flac', 'ogg', 'm4a'].includes(ext)) {
          return res.json({
            title: filename || 'Unknown File',
            thumbnail: null,
            duration: null,
            uploader: 'Direct URL',
            isDirectFile: true,
            directExt: ext,
            url: url
          });
        }
      } catch (_) {}

      return res.status(400).json({
        error: 'Could not fetch media info. Check the URL and make sure yt-dlp is installed.',
        detail: stderr.slice(0, 500)
      });
    }

    try {
      // yt-dlp can output multiple JSON objects for playlists — take first
      const firstLine = stdout.trim().split('\n')[0];
      const info = JSON.parse(firstLine);
      const formats = buildFormatList(info);

      res.json({
        title: info.title || 'Unknown',
        thumbnail: info.thumbnail || null,
        duration: info.duration || null,
        uploader: info.uploader || info.channel || '',
        webpage_url: info.webpage_url || url,
        formats
      });
    } catch (e) {
      res.status(500).json({ error: 'Failed to parse media info', detail: e.message });
    }
  });
});

// Build a clean format list from yt-dlp info
function buildFormatList(info) {
  const videoFormats = [];
  const audioFormats = [];

  // Add common video quality options
  const videoQualities = [
    { label: '1080p (Full HD)', quality: '1080', format: 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best[height<=1080]' },
    { label: '720p (HD)', quality: '720', format: 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[height<=720]' },
    { label: '480p', quality: '480', format: 'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best[height<=480]' },
    { label: '360p', quality: '360', format: 'bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360][ext=mp4]/best[height<=360]' },
  ];

  videoFormats.push(...videoQualities);

  // Audio formats
  audioFormats.push(
    { label: 'MP3 (320kbps)', quality: '320', format: 'bestaudio/best', ext: 'mp3', audioQuality: '0' },
    { label: 'MP3 (192kbps)', quality: '192', format: 'bestaudio/best', ext: 'mp3', audioQuality: '5' },
    { label: 'MP3 (128kbps)', quality: '128', format: 'bestaudio/best', ext: 'mp3', audioQuality: '9' },
    { label: 'WAV (Lossless)', quality: 'wav', format: 'bestaudio/best', ext: 'wav', audioQuality: '0' },
    { label: 'M4A (AAC)', quality: 'm4a', format: 'bestaudio[ext=m4a]/bestaudio', ext: 'm4a', audioQuality: '0' },
  );

  return { video: videoFormats, audio: audioFormats };
}

// ─────────────────────────────────────────────
// POST /api/download  – start a download job
// ─────────────────────────────────────────────
app.post('/api/download', (req, res) => {
  const { url, format, type, ext, audioQuality, isDirectFile } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  const jobId = uuidv4();
  res.json({ jobId });

  // Small delay to ensure SSE connection is established
  setTimeout(() => startDownload(jobId, { url, format, type, ext, audioQuality, isDirectFile }), 500);
});

// ─────────────────────────────────────────────
// GET /api/progress/:jobId  – SSE stream
// ─────────────────────────────────────────────
app.get('/api/progress/:jobId', (req, res) => {
  const { jobId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  sseClients.set(jobId, send);

  req.on('close', () => sseClients.delete(jobId));
});

// ─────────────────────────────────────────────
// GET /api/file/:jobId  – serve completed file
// ─────────────────────────────────────────────
app.get('/api/file/:jobId', (req, res) => {
  const { jobId } = req.params;
  const files = fs.readdirSync(DOWNLOADS_DIR).filter(f => f.startsWith(jobId));
  if (files.length === 0) return res.status(404).json({ error: 'File not found' });

  const filePath = path.join(DOWNLOADS_DIR, files[0]);
  const originalName = files[0].replace(`${jobId}_`, '');
  res.download(filePath, originalName, (err) => {
    if (!err) {
      // Clean up after download
      setTimeout(() => {
        try { fs.unlinkSync(filePath); } catch (_) {}
      }, 5000);
    }
  });
});

// ─────────────────────────────────────────────
// Start download using yt-dlp
// ─────────────────────────────────────────────
function startDownload(jobId, { url, format, type, ext, audioQuality, isDirectFile }) {
  const send = sseClients.get(jobId);
  if (!send) return;

  const safeId = jobId;
  const outputTemplate = path.join(DOWNLOADS_DIR, `${safeId}_%(title)s.%(ext)s`);

  let args = ['--no-playlist', '--no-warnings', '--newline'];

  if (isDirectFile) {
    // Direct URL download
    args.push('-o', outputTemplate);
    args.push(url);
  } else if (type === 'audio') {
    args.push(
      '-f', format || 'bestaudio/best',
      '-x',
      '--audio-format', ext || 'mp3',
      '--audio-quality', audioQuality || '0',
      '--ffmpeg-location', path.dirname(FFMPEG_BIN),
      '-o', outputTemplate,
      url
    );
  } else {
    // Video download
    args.push(
      '-f', format || 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '--merge-output-format', 'mp4',
      '--ffmpeg-location', path.dirname(FFMPEG_BIN),
      '-o', outputTemplate,
      url
    );
  }

  if (send) send({ status: 'starting', message: 'Initializing download...' });

  const ytdlp = spawn(YTDLP_BIN, args);

  // Handle yt-dlp / ffmpeg not installed
  ytdlp.on('error', (err) => {
    const s = sseClients.get(jobId);
    if (!s) return;
    if (err.code === 'ENOENT') {
      s({ status: 'error', message: '❌ yt-dlp not found. Install it from https://github.com/yt-dlp/yt-dlp/releases and add to PATH.' });
    } else {
      s({ status: 'error', message: `Spawn error: ${err.message}` });
    }
  });

  ytdlp.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;

      // Parse progress line: [download]  45.2% of ~123.45MiB at 2.34MiB/s ETA 00:30
      const progressMatch = line.match(/\[download\]\s+([\d.]+)%\s+of\s+~?([\d.]+\w+)\s+at\s+([\d.]+\w+\/s)(?:\s+ETA\s+([\d:]+))?/);
      if (progressMatch) {
        send({
          status: 'downloading',
          percent: parseFloat(progressMatch[1]),
          size: progressMatch[2],
          speed: progressMatch[3],
          eta: progressMatch[4] || '',
          message: line.trim()
        });
        continue;
      }

      // Merger / post-processing
      if (line.includes('[Merger]') || line.includes('[ffmpeg]')) {
        send({ status: 'processing', percent: 99, message: 'Merging streams...' });
        continue;
      }

      if (line.includes('[download] Destination:') || line.includes('[download] 100%')) {
        send({ status: 'processing', percent: 100, message: 'Finalizing...' });
      }
    }
  });

  ytdlp.stderr.on('data', (data) => {
    const msg = data.toString();
    if (send) send({ status: 'log', message: msg.trim() });
  });

  ytdlp.on('close', (code) => {
    if (!send) return;

    if (code === 0) {
      // Find the output file
      const files = fs.readdirSync(DOWNLOADS_DIR).filter(f => f.startsWith(jobId));
      if (files.length > 0) {
        const filename = files[0].replace(`${jobId}_`, '');
        send({
          status: 'complete',
          percent: 100,
          downloadUrl: `/api/file/${jobId}`,
          filename,
          message: 'Download complete!'
        });
      } else {
        send({ status: 'error', message: 'Download finished but file not found.' });
      }
    } else {
      send({ status: 'error', message: 'Download failed. Check the URL or install ffmpeg for video+audio merging.' });
    }
  });
}

// ─────────────────────────────────────────────
// Startup check for yt-dlp
// ─────────────────────────────────────────────
function checkDependency(bin, name) {
  const proc = spawn(bin, ['--version']);
  proc.on('error', () => {
    console.warn(`⚠️  WARNING: "${name}" not found at: ${bin}`);
    console.warn(`   Install it and add to PATH, otherwise downloads will fail.`);
    if (name === 'yt-dlp') console.warn('   → https://github.com/yt-dlp/yt-dlp/releases');
    if (name === 'ffmpeg')  console.warn('   → https://ffmpeg.org/download.html');
  });
  proc.on('close', (code) => {
    if (code === 0) console.log(`✅ ${name} found → ${bin}`);
  });
}

// ─────────────────────────────────────────────
// Start server
// ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Media Downloader running at http://localhost:${PORT}\n`);
  checkDependency(YTDLP_BIN, 'yt-dlp');
  checkDependency(FFMPEG_BIN, 'ffmpeg');
  console.log('\nDownload yt-dlp : https://github.com/yt-dlp/yt-dlp/releases');
  console.log('Download ffmpeg  : https://ffmpeg.org/download.html\n');
});
