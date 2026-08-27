const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const FRAMES_DIR = path.join(__dirname, '../frames');
const OUTPUT_FILE = path.join(__dirname, '../weather_3d_flythrough.mp4');
const FPS = 30;

function stitchVideo() {
  if (!fs.existsSync(FRAMES_DIR)) {
    console.error('Frames directory not found:', FRAMES_DIR);
    process.exit(1);
  }

  const frames = fs.readdirSync(FRAMES_DIR)
    .filter(f => f.endsWith('.png'))
    .sort();

  if (frames.length === 0) {
    console.error('No frames found');
    process.exit(1);
  }

  console.log(`Found ${frames.length} frames`);

  if (fs.existsSync(OUTPUT_FILE)) {
    fs.unlinkSync(OUTPUT_FILE);
  }

  const ffmpegCmd = `ffmpeg -y -framerate ${FPS} -i ${FRAMES_DIR}/frame_%06d.png \
    -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p \
    -movflags +faststart \
    ${OUTPUT_FILE}`;

  console.log('Running ffmpeg...');
  try {
    execSync(ffmpegCmd, { stdio: 'inherit', maxBuffer: 1024 * 1024 * 100 });
    console.log('Video created:', OUTPUT_FILE);

    const stats = fs.statSync(OUTPUT_FILE);
    console.log(`Size: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);

    const probeCmd = `ffprobe -v error -show_entries format=duration -of csv=p=0 ${OUTPUT_FILE}`;
    const duration = execSync(probeCmd, { encoding: 'utf8' }).trim();
    console.log(`Duration: ${parseFloat(duration).toFixed(1)}s`);
  } catch (e) {
    console.error('ffmpeg failed:', e.message);
    process.exit(1);
  }
}

stitchVideo();