/**
 * scripts/postinstall.js
 * Downloads yt-dlp Linux binary into ./bin/ after npm install.
 * Skipped automatically on Windows (developer uses local bin/ folder).
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

if (process.platform === 'win32') {
  console.log('Windows detected — skipping yt-dlp download (use local bin/ folder)');
  process.exit(0);
}

const binDir    = path.join(__dirname, '..', 'bin');
const ytdlpDest = path.join(binDir, 'yt-dlp');

if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });

if (fs.existsSync(ytdlpDest) && fs.statSync(ytdlpDest).size > 1000) {
  console.log('✅ yt-dlp already present in bin/ — skipping download');
  process.exit(0);
}

// Follow all redirects (GitHub releases redirect several times)
function download(url, dest, maxRedirects = 15) {
  return new Promise((resolve, reject) => {
    if (maxRedirects === 0) return reject(new Error('Too many redirects'));

    const req = https.get(url, { headers: { 'User-Agent': 'nodejs-download' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        const loc = res.headers.location;
        res.resume(); // drain current response
        return download(loc, dest, maxRedirects - 1).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }

      const tmp  = dest + '.tmp';
      const file = fs.createWriteStream(tmp);

      res.pipe(file);

      file.on('finish', () => {
        file.close(() => {
          fs.renameSync(tmp, dest);
          fs.chmodSync(dest, '755');
          resolve();
        });
      });

      file.on('error', (err) => {
        fs.existsSync(tmp) && fs.unlinkSync(tmp);
        reject(err);
      });
    });

    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Request timed out')); });
  });
}

const YTDLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

console.log('⬇  Downloading yt-dlp binary for Linux...');

download(YTDLP_URL, ytdlpDest)
  .then(() => {
    const size = (fs.statSync(ytdlpDest).size / 1024 / 1024).toFixed(1);
    console.log(`✅ yt-dlp downloaded → bin/yt-dlp (${size} MB)`);
  })
  .catch((err) => {
    console.error('❌ Failed to download yt-dlp:', err.message);
    console.error('   App will try system PATH at runtime.');
    // Don't exit(1) — let deploy continue, runtime will warn
  });
