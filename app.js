/**
 * Express application configuration
 */

const express = require('express');
const path = require('path');
const fs = require('fs');

// Import configuration
const { VIDEOS_DIR, SUBTITLES_DIR, ensureDirectories } = require('./server/config');

// Import routes
const videoRoutes = require('./server/routes/videoRoutes');
const subtitleRoutes = require('./server/routes/subtitleRoutes');
const cacheRoutes = require('./server/routes/cacheRoutes');
const updateRoutes = require('./server/routes/updateRoutes');
const lyricsRoutes = require('./server/routes/lyricsRoutes');
const geminiImageRoutes = require('./server/routes/geminiImageRoutes');
const settingsRoutes = require('./server/routes/settingsRoutes');
const douyinRoutes = require('./server/routes/douyinRoutes');
const allSitesRoutes = require('./server/routes/allSitesRoutes');
const narrationRoutes = require('./server/routes/narrationRoutes');
const testAudioRoute = require('./server/routes/testAudioRoute');

// Initialize Express app
const app = express();

// Ensure directories exist
ensureDirectories();

// ✅ Global CORS middleware: chấp nhận tất cả origin có credentials
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control, Pragma, Expires');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

// Configure JSON body parser with increased limit for base64 encoded files
app.use(express.json({ limit: '500mb' }));

// Serve static directories with proper CORS headers
const staticOptions = {
  setHeaders: (res, path, stat) => {
    const req = res.req;
    const origin = req.headers.origin;

    if (origin) {
      res.set('Access-Control-Allow-Origin', origin);
    }
    res.set('Access-Control-Allow-Credentials', 'true');
    res.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control, Pragma, Expires');
  }
};

app.use('/videos', express.static(path.join(__dirname, 'videos'), staticOptions));
app.use('/videos/album_art', express.static(path.join(__dirname, 'videos', 'album_art'), staticOptions));
app.use('/subtitles', express.static(path.join(__dirname, 'subtitles'), staticOptions));
app.use('/narration', express.static(path.join(__dirname, 'narration'), staticOptions));
app.use('/public', express.static(path.join(__dirname, 'public'), staticOptions));
app.use('/public/videos/album_art', express.static(path.join(__dirname, 'public', 'videos', 'album_art'), staticOptions));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is healthy', timestamp: new Date().toISOString() });
});

// Test endpoint to verify server is working
app.get('/api/test', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Endpoint to save localStorage data for server-side use
app.post('/api/save-local-storage', express.json(), (req, res) => {
  try {
    const localStorageData = req.body;
    const localStoragePath = path.join(__dirname, 'localStorage.json');
    fs.writeFileSync(localStoragePath, JSON.stringify(localStorageData, null, 2));
    res.json({ success: true, message: 'localStorage data saved successfully' });
  } catch (error) {
    console.error('Error saving localStorage data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Register API routes
app.use('/api', videoRoutes);
app.use('/api', subtitleRoutes);
app.use('/api', cacheRoutes);
app.use('/api', updateRoutes);
app.use('/api', lyricsRoutes);
app.use('/api', settingsRoutes);
app.use('/api', douyinRoutes);
app.use('/api', allSitesRoutes);
app.use('/api/gemini', geminiImageRoutes);
app.use('/api/narration', narrationRoutes);
app.use('/api/test', testAudioRoute);

module.exports = app;
