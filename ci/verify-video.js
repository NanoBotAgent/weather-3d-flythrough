const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

const VIDEO_PATH = path.join(__dirname, '..', 'weather_3d_flythrough.mp4');
const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error('ERROR: GEMINI_API_KEY not set');
  process.exit(1);
}

if (!fs.existsSync(VIDEO_PATH)) {
  console.error('ERROR: Video file not found at', VIDEO_PATH);
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-3.7-flash' });

const PROMPT = `
Analyze this weather flythrough video. Verify it contains all of the following:

1. **3D Cesium globe** with terrain/earth visible (not a flat map)
2. **Camera orbiting Grandvoir, Belgium** (lat 50.1, lon 5.37) for the first 3 days (Wed 26, Thu 27, Fri 28)
3. **Flight transition** from Grandvoir to Vianden, Luxembourg (lat 49.9, lon 6.2) — smooth camera flight between locations
4. **Camera orbiting Vianden, Luxembourg** for the remaining 4 days (Sat 29, Sun 30, Mon 31, Tue 1)
5. **Rain/storm particle overlays** matching each day's condition:
   - Wed 26: Partly cloudy (light clouds)
   - Thu 27: PM thunderstorms (storm particles)
   - Fri 28: Thunderstorms (heavy storm particles)
   - Sat 29: Light rain (rain particles)
   - Sun 30: Showers (rain particles)
   - Mon 31: Light rain (rain particles)
   - Tue 1: Partly cloudy (light clouds)
6. **Day labels** appearing on screen for each day (e.g., "Wed 26", "Thu 27", etc.)
7. **Location names** shown (Grandvoir, Belgium / Vianden, Luxembourg)
8. **Temperature ranges** displayed (min/max temps for each day)
9. **Technical specs**: 1920x1080 resolution, ~45 seconds duration, smooth 30fps playback

Return ONLY valid JSON in this exact format:
{
  "pass": true/false,
  "issues": ["issue1", "issue2", ...],
  "details": {
    "globe_visible": true/false,
    "grandvoir_orbit": true/false,
    "flight_transition": true/false,
    "vianden_orbit": true/false,
    "particles_match": true/false,
    "day_labels": true/false,
    "location_names": true/false,
    "temperatures": true/false,
    "resolution_ok": true/false,
    "duration_ok": true/false,
    "fps_ok": true/false
  }
}
`;

async function verifyVideo() {
  console.log('Uploading video to Gemini...');
  
  const videoFile = await genAI.uploadFile(VIDEO_PATH, {
    mimeType: 'video/mp4',
    displayName: 'weather-3d-flythrough.mp4'
  });

  console.log('Video uploaded:', videoFile.file.name);
  console.log('Waiting for video processing...');

  // Wait for video to be processed
  let file = await genAI.getFile(videoFile.file.name);
  while (file.state === 'PROCESSING') {
    await new Promise(r => setTimeout(r, 5000));
    file = await genAI.getFile(videoFile.file.name);
    console.log('  State:', file.state);
  }

  if (file.state === 'FAILED') {
    console.error('Video processing failed');
    process.exit(1);
  }

  console.log('Video ready, sending verification prompt...');

  const result = await model.generateContent([
    { fileData: { fileUri: videoFile.file.uri, mimeType: 'video/mp4' } },
    { text: PROMPT }
  ]);

  const response = result.response.text();
  console.log('Gemini response:', response);

  let parsed;
  try {
    // Extract JSON from response (in case there's markdown wrapper)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : response);
  } catch (e) {
    console.error('Failed to parse Gemini response as JSON:', e);
    console.error('Raw response:', response);
    process.exit(1);
  }

  console.log('\n=== VERIFICATION RESULT ===');
  console.log('PASS:', parsed.pass);
  if (parsed.issues && parsed.issues.length > 0) {
    console.log('ISSUES:');
    parsed.issues.forEach(issue => console.log('  -', issue));
  }
  if (parsed.details) {
    console.log('DETAILS:');
    Object.entries(parsed.details).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  }

  if (!parsed.pass) {
    console.error('\n❌ VERIFICATION FAILED');
    process.exit(1);
  } else {
    console.log('\n✅ VERIFICATION PASSED');
  }
}

verifyVideo().catch(e => {
  console.error('Verification error:', e);
  process.exit(1);
});