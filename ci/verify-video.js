const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
const https = require('https');

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
const PRIMARY_MODEL = 'gemini-3.7-flash';
const FALLBACK_MODEL = 'gemini-3.6-flash';

const PROMPT = `
You are reviewing an animated 3D weather flythrough video destined for YouTube. Assess whether it looks polished enough to post, or too simple/janky. Judge ONLY what a viewer would actually see on screen.

What the render produces: a CesiumJS 3D globe (procedural blue-marble coloring, no real satellite imagery), a three.js particle overlay for weather, and an HTML info panel. Reject clear defects, but do NOT fail it for style choices outside this scope (no real terrain heightmap, no live day/night terminator).

Verify ALL of the following. If any clearly fails, set "pass": false.

=== MUST BE TRUE ===
1. **3D globe** - A recognizable rotating Earth sphere (not a flat 2D map, not blank/black). Continents and ocean coloring are visible.
2. **Camera motion** - Smooth, continuous orbital motion plus a gliding flight between the two locations. No jitter, stutter, teleport cuts, or frozen camera.
3. **Weather particles** - Rain, storm, cloud, and clear-sky particles are visibly distinct from each other and match the current condition label.
4. **Storm effects** - Thunderstorm days show heavy rain together with lightning flashes (not rain alone).
5. **Info panel readability** - A readable overlay panel showing the location name, day label, weather condition, and low/high temperatures. Text is crisp and legible.
6. **Text updates** - Panel content changes as the camera advances between days and between the two locations.
7. **Lighting** - The globe is lit on the camera-facing side; frames are bright enough to see detail (not a near-black frame).
8. **Color** - Cohesive, professional palette. Not washed out, not oversaturated.
9. **No glitches** - No black frames, solid-color flashes, texture flicker, camera clipping, or missing content.
10. **Composition** - Frames are visually balanced and interesting, not flat or empty.

Technical facts (1920x1080, 30fps, H.264, duration) are already verified separately by ffprobe — do not re-check them.

Return ONLY valid JSON in this exact format:
{
  "pass": true/false,
  "issues": ["specific issue 1", "specific issue 2", ...],
  "details": {
    "globe_3d_visible": true/false,
    "camera_motion_smooth": true/false,
    "particles_distinct": true/false,
    "storm_lightning_effect": true/false,
    "info_panel_readable": true/false,
    "text_updates_with_days": true/false,
    "lighting_adequate": true/false,
    "color_cohesive": true/false,
    "no_black_or_glitch_frames": true/false,
    "composition_good": true/false
  }
}
`;

async function uploadFile(filePath, mimeType, displayName) {
  const fileSize = fs.statSync(filePath).size;
  const startUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${API_KEY}`;
  
  return new Promise((resolve, reject) => {
    const metadata = JSON.stringify({ file: { display_name: displayName } });
    
    const req = https.request(startUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': fileSize.toString(),
        'X-Goog-Upload-Header-Content-Type': mimeType
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const uploadUrl = res.headers['x-goog-upload-url'];
        if (!uploadUrl) {
          reject(new Error('No upload URL in response: ' + data));
          return;
        }
        
        uploadFileBytes(uploadUrl, filePath, fileSize, mimeType).then(resolve).catch(reject);
      });
    });
    
    req.on('error', reject);
    req.write(metadata);
    req.end();
  });
}

function uploadFileBytes(uploadUrl, filePath, fileSize, mimeType) {
  return new Promise((resolve, reject) => {
    const fileStream = fs.createReadStream(filePath);
    
    const req = https.request(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Length': fileSize.toString(),
        'X-Goog-Upload-Offset': '0',
        'X-Goog-Upload-Command': 'upload,finalize',
        'Content-Type': mimeType
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.file) {
            resolve(parsed.file);
          } else {
            reject(new Error('Upload failed: ' + data));
          }
        } catch (e) {
          reject(new Error('Invalid JSON response: ' + data));
        }
      });
    });
    
    req.on('error', reject);
    fileStream.pipe(req);
  });
}

async function getFile(fileName) {
  const url = `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${API_KEY}`;
  
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Invalid JSON response: ' + data));
        }
      });
    }).on('error', reject);
  });
}

async function verifyVideo() {
  console.log('Uploading video to Gemini...');
  
  const videoFile = await uploadFile(VIDEO_PATH, 'video/mp4', 'weather-3d-flythrough.mp4');

  console.log('Video uploaded:', videoFile.name);
  console.log('Waiting for video processing...');

  let file = await getFile(videoFile.name);
  while (file.state === 'PROCESSING') {
    await new Promise(r => setTimeout(r, 5000));
    file = await getFile(videoFile.name);
    console.log('  State:', file.state);
  }

  if (file.state === 'FAILED') {
    console.error('Video processing failed');
    process.exit(1);
  }

  console.log('Video ready, sending verification prompt...');

  // Retry wrapper for 503 (service overloaded) and 429 (rate limit/quota) errors
  // Max 10 retries with longer max delay (60s) to handle sustained 503/429
  async function generateWithRetry(promptParts, modelName, maxRetries) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const currentModel = genAI.getGenerativeModel({ model: modelName });
        const result = await currentModel.generateContent(promptParts);
        return result;
      } catch (e) {
        lastError = e;
        const msg = e.message || '';
        const is503 = msg.includes('503') || msg.includes('Service Unavailable') || msg.includes('overloaded');
        const is429 = msg.includes('429') || msg.includes('Too Many Requests') || msg.includes('quota');
        if ((is503 || is429) && attempt < maxRetries) {
          // Exponential backoff capped at 60 seconds
          let delay = Math.min(1000 * Math.pow(2, attempt - 1), 60000);
          const retryMatch = msg.match(/retryDelay\":\s*"([\d.]+)s"/);
          if (retryMatch) {
            delay = Math.min(parseFloat(retryMatch[1]) * 1000 + 2000, 120000);
          }
          console.log(`  ⚠️ ${is429 ? '429 Rate Limited' : '503 Service Overloaded'} (${modelName}, attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw e;
      }
    }
    throw lastError;
  }

  const promptParts = [
    { fileData: { fileUri: videoFile.uri, mimeType: 'video/mp4' } },
    { text: PROMPT }
  ];

  let result;
  try {
    console.log(`Using primary model: ${PRIMARY_MODEL} (max 10 retries)`);
    result = await generateWithRetry(promptParts, PRIMARY_MODEL, 10);
  } catch (e) {
    console.error(`  ❌ Primary model (${PRIMARY_MODEL}) exhausted all 10 retries`);
    console.log(`Falling back to ${FALLBACK_MODEL} (max 15 retries)...`);
    try {
      result = await generateWithRetry(promptParts, FALLBACK_MODEL, 15);
      console.log(`Fallback model (${FALLBACK_MODEL}) succeeded`);
    } catch (fallbackError) {
      console.error(`  ❌ Fallback model (${FALLBACK_MODEL}) also failed after 15 retries`);
      throw fallbackError;
    }
  }

  const response = result.response.text();
  console.log('Gemini response:', response);

  let parsed;
  try {
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

  let anyDetailFalse = false;
  if (parsed.details) {
    for (const [k, v] of Object.entries(parsed.details)) {
      if (v === false) {
        console.error(`  ❌ Detail failed: ${k}`);
        anyDetailFalse = true;
      }
    }
  }

  if (!parsed.pass || anyDetailFalse) {
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
