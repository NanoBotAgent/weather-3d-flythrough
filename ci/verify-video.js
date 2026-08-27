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
Analyze this weather flythrough video with EXTREME STRICTNESS. This is for a production YouTube channel — quality must be professional. Reject anything that looks amateur, buggy, or incomplete.

Verify ALL of the following criteria. If ANY criterion fails, set "pass": false.

=== VISUAL QUALITY (must all be true) ===
1. **3D Cesium globe** — Realistic Earth with terrain elevation, atmosphere glow, and day/night terminator visible. NOT a flat 2D map projection.
2. **Globe rendering quality** — No visible seams, texture popping, z-fighting, or level-of-detail artifacts. Terrain looks natural at all zoom levels.
3. **Camera motion** — Buttery smooth orbital paths (no jitter, stutter, sudden speed changes, or easing artifacts). Grandvoir orbit: ~3 days. Vianden orbit: ~4 days.
4. **Flight transition** — Cinematic camera flight from Grandvoir (50.1, 5.37) to Vianden (49.9, 6.2). Smooth arc with proper banking, ~3-5 seconds. No teleport cuts.
5. **Particle systems** — Each day's weather has DISTINCT, appropriate particle effects:
   - Wed 26: Partly cloudy — sparse, wispy cloud particles, subtle
   - Thu 27: PM thunderstorms — lightning flashes + heavy rain + dark storm clouds
   - Fri 28: Thunderstorms — intense lightning, heavy downpour, ominous sky
   - Sat 29: Light rain — steady gentle rain streaks
   - Sun 30: Showers — intermittent rain bursts
   - Mon 31: Light rain — steady gentle rain streaks
   - Tue 1: Partly cloudy — sparse, wispy cloud particles
   Particles must be 3D (billboards facing camera), not 2D screen overlays.
6. **Particle synchronization** — Particles change EXACTLY when day label changes. No lag, no overlap between day conditions.

=== UI / TEXT OVERLAYS (must all be true) ===
7. **Day labels** — Clear, readable text for each of 7 days ("Wed 26" through "Tue 1"). Appears at day transition, stays visible for that day's segment. Professional typography (not default browser font).
8. **Location names** — "Grandvoir, Belgium" shown during first orbit, "Vianden, Luxembourg" during second. Visible long enough to read.
9. **Temperature displays** — Min/max temps for EACH day shown numerically (e.g., "17°/25°C"). Units clear. Updates per day.
10. **Weather condition text** — Condition text matches particles (e.g., "Thunderstorms" when storm particles active).
11. **UI polish** — No overlapping text, no clipping, consistent positioning, smooth fade in/out transitions. No default HTML/CSS look.

=== TECHNICAL SPECS (must all be true) ===
12. **Resolution** — Exactly 1920x1080 (not upscaled, not letterboxed).
13. **Duration** — 42-48 seconds total (7 days × ~6-7s each including transitions).
14. **Frame rate** — Consistent 30fps throughout. No dropped frames, no variable frame rate.
15. **Encoding** — H.264, yuv420p, CRF ≤23. No visible compression artifacts (blocking, banding, mosquito noise).
16. **Aspect ratio** — 16:9 full frame. No pillarboxing/letterboxing.

=== CINEMATIC QUALITY (must all be true) ===
17. **Lighting** — Dynamic sun position matching time of day. Shadows on terrain. Atmosphere scattering visible.
18. **Color grading** — Cohesive look. Not washed out, not oversaturated. Night scenes actually dark.
19. **Camera composition** — Rule of thirds, interesting angles. Not just top-down orbits.
20. **No bugs/glitches** — Zero: texture flicker, camera clipping through terrain, particles clipping, UI flicker, missing frames, black frames, green flashes.

Return ONLY valid JSON in this exact format:
{
  "pass": true/false,
  "issues": ["specific issue 1", "specific issue 2", ...],
  "details": {
    "globe_3d_realistic": true/false,
    "globe_render_quality": true/false,
    "camera_motion_smooth": true/false,
    "flight_transition_cinematic": true/false,
    "particles_distinct_per_day": true/false,
    "particles_3d_not_2d": true/false,
    "particles_sync_with_days": true/false,
    "day_labels_clear_professional": true/false,
    "location_names_shown": true/false,
    "temperatures_per_day": true/false,
    "condition_text_matches": true/false,
    "ui_polished_no_artifacts": true/false,
    "resolution_exact_1920x1080": true/false,
    "duration_42_48s": true/false,
    "fps_consistent_30": true/false,
    "encoding_clean": true/false,
    "aspect_ratio_16_9": true/false,
    "lighting_dynamic": true/false,
    "color_grading_cohesive": true/false,
    "camera_composition_good": true/false,
    "zero_bugs_glitches": true/false
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
