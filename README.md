# ⚡ MediaPull — Video & Audio Downloader

A beautiful, full-stack web app to download videos and audio from **YouTube, TikTok, Twitter, Instagram, Vimeo, and 1000+ other platforms**.

## Prerequisites

Before running, install these two CLI tools and make sure they are in your system PATH:

### 1. yt-dlp
Download the latest release from:  
👉 https://github.com/yt-dlp/yt-dlp/releases/latest

- Download `yt-dlp.exe` (Windows)
- Place it somewhere in your PATH (e.g., `C:\Windows\System32\` or add its folder to PATH)

### 2. ffmpeg
Required for merging video+audio streams and audio extraction:  
👉 https://www.gyan.dev/ffmpeg/builds/ → Download `ffmpeg-release-essentials.zip`

- Extract and add the `bin/` folder to your system PATH
- Verify: `ffmpeg -version` in terminal

---

## Getting Started

```bash
# 1. Install Node.js dependencies
npm install

# 2. Start the server
npm start

# 3. Open your browser
# Visit: http://localhost:3000
```

---

## Features

- 🌐 **1000+ Sites** — Powered by yt-dlp
- 🎬 **Video**: 1080p / 720p / 480p / 360p (MP4)
- 🎵 **Audio**: MP3 (320/192/128kbps), WAV, M4A
- 📊 **Real-time progress** with speed, size & ETA
- 📋 **Clipboard paste** support
- 🕓 **Download history** (stored locally)
- 🎨 **Premium dark UI** with glassmorphism

## Folder Structure

```
file_downloader/
├── server.js        # Express backend
├── package.json
├── public/
│   ├── index.html   # Main page
│   ├── style.css    # Styling
│   └── app.js       # Frontend logic
└── downloads/       # Temporary download folder (auto-created)
```
