/**
 * Server configuration and directory setup
 */

const path = require('path');
const fs = require('fs');

// Server configuration
const PORT = process.env.PORT || 3007; // Changed from 3004 to avoid port conflicts
const SERVER_URL = process.env.BACKEND_URL+''; // Using IPv4 address for better compatibility
// Allow both localhost and 127.0.0.1 for development
const CORS_ORIGIN = process.env.NODE_ENV === 'production' ? '*' : [process.env.FRONTEND_URL, process.env.BACKEND_URL];

// Directory paths
let VIDEOS_DIR, SUBTITLES_DIR, NARRATION_DIR;

// Check for environment variables first
if (process.env.VIDEOS_DIR && process.env.SUBTITLES_DIR) {
  VIDEOS_DIR = process.env.VIDEOS_DIR;
  SUBTITLES_DIR = process.env.SUBTITLES_DIR;
  NARRATION_DIR = process.env.NARRATION_DIR || path.join(__dirname, '..', 'narration');

} else {
  // Use relative paths
  VIDEOS_DIR = path.join(__dirname, '..', 'videos');
  SUBTITLES_DIR = path.join(__dirname, '..', 'subtitles');
  NARRATION_DIR = path.join(__dirname, '..', 'narration');

}

// Ensure directories exist
const ensureDirectories = () => {
  // Ensure videos directory exists
  if (!fs.existsSync(VIDEOS_DIR)) {
    fs.mkdirSync(VIDEOS_DIR, { recursive: true });

  }

  // Ensure subtitles directory exists
  if (!fs.existsSync(SUBTITLES_DIR)) {
    fs.mkdirSync(SUBTITLES_DIR, { recursive: true });

  }

  // Ensure narration directory exists
  if (!fs.existsSync(NARRATION_DIR)) {
    fs.mkdirSync(NARRATION_DIR, { recursive: true });

  }

  // Ensure album art directory exists
  const ALBUM_ART_DIR = path.join(VIDEOS_DIR, 'album_art');
  if (!fs.existsSync(ALBUM_ART_DIR)) {
    fs.mkdirSync(ALBUM_ART_DIR, { recursive: true });

  }

  // Ensure lyrics directory exists
  const LYRICS_DIR = path.join(VIDEOS_DIR, 'lyrics');
  if (!fs.existsSync(LYRICS_DIR)) {
    fs.mkdirSync(LYRICS_DIR, { recursive: true });

  }

  // Ensure narration subdirectories exist
  const REFERENCE_AUDIO_DIR = path.join(NARRATION_DIR, 'reference');
  const OUTPUT_AUDIO_DIR = path.join(NARRATION_DIR, 'output');

  if (!fs.existsSync(REFERENCE_AUDIO_DIR)) {
    fs.mkdirSync(REFERENCE_AUDIO_DIR, { recursive: true });

  }

  if (!fs.existsSync(OUTPUT_AUDIO_DIR)) {
    fs.mkdirSync(OUTPUT_AUDIO_DIR, { recursive: true });

  }
};

module.exports = {
  PORT,
  SERVER_URL,
  CORS_ORIGIN,
  VIDEOS_DIR,
  SUBTITLES_DIR,
  NARRATION_DIR,
  ensureDirectories
};
