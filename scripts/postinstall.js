/**
 * scripts/postinstall.js
 * Runs after `npm install` — downloads yt-dlp Linux binary into ./bin/
 * Skipped automatically on Windows (developer uses local bin/ folder).
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// Skip on Windows — developer has .exe files locally
if (process.platform === 'win32') {
  console.log('Windows detected — skipping yt-dlp download (use local bin/ folder)');
  process.exit(0);
}

const binDir    = path.join(__dirname, '..', 'bin');
const ytdlpDest = path.join(binDir, 'yt-dlp');

if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });

if (fs.existsSync(ytdlpDest)) {
  console.log('✅ yt-dlp already present in bin/');
  process.exit(0);
}

const YTDLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

function download(url, dest, redirects = 0) {
  if (redirects > 10) { console.error('Too many redirects'); process.exit(1); }

  https.get(url, { headers: { 'User-Agent': 'node' } }, (res) => {
    if (res.statusCode === 301 || res.statusCode === 302) {
      return download(res.headers.location, dest, redirects + 1);
    }
    if (res.statusCode !== 200) {
      console.error(`Failed to download yt-dlp: HTTP ${res.statusCode}`);
      process.exit(1);
    }

    const file = fs.createWriteStream(dest);
    res.pipe(file);
    file.on('finish', () => {
      file.close(() => {
        fs.chmodSync(dest, '755');
        console.log('✅ yt-dlp downloaded → bin/yt-dlp');
      });
    });
  }).on('error', (err) => {
    fs.existsSync(dest) && fs.unlinkSync(dest);
    console.error('Download error:', err.message);
    process.exit(1);
  });
}

console.log('⬇  Downloading yt-dlp binary...');
download(YTDLP_URL, ytdlpDest);
