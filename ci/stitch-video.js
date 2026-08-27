const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const FRAMES_DIR = path.join(__dirname, '../frames');
const OUTPUT_FILE = path.join(__dirname, '../weather_3d_flythrough.mp4');
const FPS = 30;

function stitchVideo() {
  console.log('FRAMES_DIR:', FRAMES_DIR);
  console.log('cwd:', process.cwd());
  console.log('__dirname:', __dirname);
  
  if (!fs.existsSync(FRAMES_DIR)) {
    console.error('Frames directory not found:', FRAMES_DIR);
    console.log('Contents of parent:', fs.readdirSync(path.join(__dirname, '..')));
    process.exit(1);
  }

  const frames = fs.readdirSync(FRAMES_DIR)
    .filter(f => f.endsWith('.png'))
    .sort();

  if (frames.length === 0) {
    console.error('No frames found');
    console.log('All files in dir:', fs.readdirSync(FRAMES_DIR));
    process.exit(1);
  }

  console.log(`Found ${frames.length} frames`);
  console.log('First few:', frames.slice(0, 5));
  console.log('Last few:', frames.slice(-5));

  // Check for gaps in sequence
  const nums = frames.map(f => parseInt(f.match(/frame_(\d+)\.png/)?.[1] || '0', 10));
  const expected = Array.from({length: frames.length}, (_, i) => i);
  const missing = expected.filter(n => !nums.includes(n));
  if (missing.length > 0) {
    console.log('Missing frame numbers:', missing.slice(0, 10));
  }

  if (fs.existsSync(OUTPUT_FILE)) {
    fs.unlinkSync(OUTPUT_FILE);
  }

  const ffmpegCmd = `ffmpeg -y -framerate ${FPS} -start_number 0 -i ${FRAMES_DIR}/frame_%06d.png ` +
    `-c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p ` +
    `-movflags +faststart ${OUTPUT_FILE}`;

  console.log('FFmpeg command:', ffmpegCmd);
  console.log('Running ffmpeg...');
  try {
    const result = execSync(ffmpegCmd, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 100 });
    console.log(result);
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
