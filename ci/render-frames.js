const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;
const SECONDS_PER_DAY = 3;
const TOTAL_DAYS = 7;
const LOCATIONS = 2;
const INTRO_FRAMES = 30;
const FLIGHT_FRAMES = 60;
const FRAMES_PER_DAY = FPS * SECONDS_PER_DAY;
const TOTAL_FRAMES = INTRO_FRAMES + (LOCATIONS * TOTAL_DAYS * FRAMES_PER_DAY) + ((LOCATIONS - 1) * FLIGHT_FRAMES);

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const OUTPUT_DIR = path.join(ROOT, 'frames');

// Simple static file server for src/
function startServer() {
  const mime = {
    '.html': 'text/html', '.js': 'application/javascript',
    '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.json': 'application/json', '.woff2': 'font/woff2'
  };

  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';

    const filePath = path.join(SRC, urlPath);
    if (!filePath.startsWith(SRC)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404); res.end('Not Found'); return;
      }
      res.writeHead(200, {
        'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(data);
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      console.log(`Static server on http://127.0.0.1:${port}`);
      resolve({ server, port });
    });
  });
}

async function renderFrames() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const { server, port } = await startServer();
  const url = `http://127.0.0.1:${port}/`;

  const browser = await puppeteer.launch({
    headless: 'new',
    protocolTimeout: 600000,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--use-gl=swiftshader',
      '--use-angle=swiftshader',
      '--enable-webgl',
      '--ignore-gpu-blocklist'
    ]
  });

  const browserPage = await browser.newPage();
  await browserPage.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
  
  // Track browser errors
  let browserError = null;
  browserPage.on('console', msg => {
    const t = msg.type();
    if (t === 'error' || t === 'warning') console.log(`[browser:${t}]`, msg.text());
  });
  browserPage.on('pageerror', err => {
    console.log('[browser:error]', err.message);
    browserError = err.message;
  });
  browserPage.on('requestfailed', req => console.log('[browser:requestfailed]', req.url(), req.failure().errorText));

  let frameCount = 0;
  let framePromiseResolve;
  const framePromise = new Promise(r => { framePromiseResolve = r; });

  await browserPage.exposeFunction('onFrameReady', async (frameNum, buffer) => {
    const framePath = path.join(OUTPUT_DIR, `frame_${String(frameNum).padStart(6, '0')}.png`);
    fs.writeFileSync(framePath, Buffer.from(buffer));
    frameCount++;
    if (frameCount % 30 === 0) console.log(`Captured frame ${frameCount}/${TOTAL_FRAMES}`);
    if (frameCount >= TOTAL_FRAMES) {
      framePromiseResolve();
    }
  });

  console.log('Loading page...');
  await browserPage.goto(url, { waitUntil: 'networkidle0', timeout: 180000 });
  await browserPage.waitForFunction(() => window.THREE !== undefined, { timeout: 180000 });

  console.log('Initializing globe scene...');
  try {
    await browserPage.evaluate(() => window.initScene());
  } catch (e) {
    console.error('initScene FAILED:', e.message);
    // Dump browser console logs and check for errors
    const logs = await browserPage.evaluate(() => {
      return Array.from(document.querySelectorAll('script')).map(s => s.src).join('\n');
    });
    console.error('Scripts loaded:', logs);
    if (browserError) console.error('Browser error during init:', browserError);
    throw e;
  }

  // Verify globe canvas exists after init
  const canvasCheck = await browserPage.evaluate(() => {
    const canvas = document.getElementById('globeCanvas');
    return { hasCanvas: !!canvas, canvasWidth: canvas?.width, canvasHeight: canvas?.height };
  });
  console.log('Canvas check:', JSON.stringify(canvasCheck));
  if (!canvasCheck.hasCanvas) {
    throw new Error('globeCanvas not found after initScene');
  }

  // Short settle delay so the first render + DOM panel are ready before capture.
  console.log('Settling (2s before capture)...');
  await new Promise(r => setTimeout(r, 2000));

  // Inject frame capture logic into the browser
  await browserPage.evaluate((totalFrames) => {
    // Draw the HTML weather info panel manually onto a 2D canvas, reading the
    // live DOM text so it stays in sync with updateInfo(). Avoids SVG/DOM
    // serialization and font-loading issues in headless Chromium.
    window.drawWeatherPanel = function(ctx, W, H) {
      const read = (id) => {
        const el = document.getElementById(id);
        return el ? el.textContent : '';
      };
      const location = read('locationName');
      const day = read('dayInfo');
      const condition = read('condition');
      const low = read('lowTemp');
      const high = read('highTemp');
      const rain = read('rainChance');

      const panelW = 620;
      const padTop = 28;
      const padBottom = 26;
      const titleSize = 30;
      const subSize = 20;
      const condSize = 22;
      const labelSize = 11;
      const valueSize = 18;

      const titleH = titleSize;
      const dayH = subSize + 6;
      const condH = condSize + 8;
      const rowH = labelSize + 6 + valueSize;
      const panelH = padTop + titleH + 4 + dayH + 16 + condH + 18 + rowH + padBottom;
      const panelX = (W - panelW) / 2;
      const panelY = H - 40 - panelH;
      const centerX = W / 2;

      // Rounded rect background + border
      const r = 20;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(panelX + r, panelY);
      ctx.arcTo(panelX + panelW, panelY, panelX + panelW, panelY + panelH, r);
      ctx.arcTo(panelX + panelW, panelY + panelH, panelX, panelY + panelH, r);
      ctx.arcTo(panelX, panelY + panelH, panelX, panelY, r);
      ctx.arcTo(panelX, panelY, panelX + panelW, panelY, r);
      ctx.closePath();
      const grad = ctx.createLinearGradient(panelX, panelY, panelX, panelY + panelH);
      grad.addColorStop(0, 'rgba(10,15,26,0.98)');
      grad.addColorStop(1, 'rgba(20,29,46,0.95)');
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#1e3a5f';
      ctx.stroke();
      ctx.restore();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      let cy = panelY + padTop;

      ctx.font = '700 ' + titleSize + 'px sans-serif';
      ctx.fillStyle = '#10b981';
      ctx.fillText(location, centerX, cy + titleSize);
      cy += titleSize + 8;

      ctx.font = '500 ' + subSize + 'px sans-serif';
      ctx.fillStyle = '#7c8ba4';
      ctx.fillText(day, centerX, cy + subSize);
      cy += subSize + 14;

      ctx.font = '500 ' + condSize + 'px sans-serif';
      ctx.fillStyle = '#f0f4f8';
      ctx.fillText(condition.charAt(0).toUpperCase() + condition.slice(1), centerX, cy + condSize);
      cy += condSize + 18;

      // Data row: Low / High / Precipitation
      const gap = 130;
      const cols = [
        { label: 'LOW', value: low, color: '#38bdf8' },
        { label: 'HIGH', value: high, color: '#fb923c' },
        { label: 'PRECIPITATION', value: rain, color: '#38bdf8' }
      ];
      cols.forEach((col, i) => {
        const x = centerX + (i - 1) * gap;
        ctx.font = '600 ' + labelSize + 'px sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText(col.label, x, cy + labelSize);
        ctx.font = '500 ' + valueSize + 'px monospace';
        ctx.fillStyle = col.color;
        ctx.fillText(col.value, x, cy + labelSize + 6 + valueSize);
      });
    };

    window.captureFrame = async function(frameNum) {
      const globe = document.getElementById('globeCanvas');
      const rain = document.getElementById('rainOverlay');
      if (!globe) {
        console.error('Capture frame: globe canvas not found');
        return;
      }

      // Let the caller's synchronous renders settle before reading buffers.
      await new Promise(r => setTimeout(r, 16));

      // Composite all three layers onto a single 1920x1080 canvas.
      const comp = document.createElement('canvas');
      comp.width = 1920;
      comp.height = 1080;
      const ctx = comp.getContext('2d');

      // 1. Three.js globe
      ctx.drawImage(globe, 0, 0, 1920, 1080);
      // 2. three.js particle overlay (transparent, on top of globe)
      if (rain && rain.width > 0 && rain.height > 0) {
        ctx.drawImage(rain, 0, 0, 1920, 1080);
      }
      // 3. Weather info panel (drawn from live DOM text)
      window.drawWeatherPanel(ctx, 1920, 1080);

      // Brightness self-check on the final composite
      const probe = document.createElement('canvas');
      probe.width = 64;
      probe.height = 36;
      const pctx = probe.getContext('2d');
      pctx.drawImage(comp, 0, 0, 64, 36);
      const px = pctx.getImageData(0, 0, 64, 36).data;
      let lumSum = 0;
      for (let i = 0; i < px.length; i += 4) {
        lumSum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      }
      const meanLum = lumSum / (64 * 36);
      if (!window._frameLuminance) window._frameLuminance = [];
      window._frameLuminance.push(meanLum);
      if (frameNum % 30 === 0) {
        console.log(`[brightness] frame ${frameNum}: mean luminance ${meanLum.toFixed(1)}/255`);
      }

      const blob = await new Promise(resolve => comp.toBlob(resolve, 'image/png'));
      const arrayBuffer = await blob.arrayBuffer();
      const buffer = Array.from(new Uint8Array(arrayBuffer));

      await window.onFrameReady(frameNum, buffer);
    };
  }, TOTAL_FRAMES);

  console.log('Starting synchronized frame capture...');
  
  // Override the animation loop to be frame-synchronous
  await browserPage.evaluate((totalFrames) => {
    window.startAnimation = function(totalFrames) {
      // Reuse the SAME animationState object that updateCamera() reads (exposed
      // as window.animationState in main.js). Creating a fresh object here was
      // silently freezing the camera/weather because updateCamera closes over
      // the original `animationState` binding.
      const state = window.animationState;
      state.totalFrames = totalFrames;
      state.frame = 0;
      state.fps = 30;
      state.secondsPerDay = 3;
      state.currentPhase = 'intro';
      state.locationIndex = 0;
      state.dayIndex = 0;
      state.flightProgress = 0;
      state._lastDayKey = '0:0';

      const firstLoc = window.CONFIG.locations[0];
      const firstDay = firstLoc.days[0];
      window.weatherOverlay.updateInfo(firstLoc, firstDay);
      window.particleSystem.setCondition(firstDay.condition, firstDay.rain / 100);

      window.renderNextFrame = async function() {
        if (state.frame >= state.totalFrames) {
          window.renderComplete = true;
          return;
        }

        const dt = 1 / state.fps;

        // updateCamera advances the phase, camera, day/location transitions,
        // and particle positions (it calls particleSystem.update internally).
        window.updateCamera(dt);
        window.particleSystem.render();
        window.globeRenderer.render();

        await window.captureFrame(state.frame);

        state.frame++;

        if (state.frame < state.totalFrames) {
          setTimeout(window.renderNextFrame, 0);
        } else {
          window.renderComplete = true;
        }
      };

      window.renderNextFrame();
    };
  }, TOTAL_FRAMES);

  // Start the synchronized animation
  await browserPage.evaluate((frames) => {
    window.startAnimation(frames);
  }, TOTAL_FRAMES);

  // Wait for all frames to be captured
  const timeout = setTimeout(() => {
    console.error('Timeout waiting for frames - exiting');
    process.exit(1);
  }, 3600000); // 1 hour timeout

  await framePromise;
  clearTimeout(timeout);

  // Summarize frame brightness to surface dark/blank renders at a glance
  const lum = await browserPage.evaluate(() => window._frameLuminance || []);
  if (lum.length > 0) {
    const mean = lum.reduce((a, b) => a + b, 0) / lum.length;
    const min = Math.min(...lum);
    const max = Math.max(...lum);
    console.log(`[brightness] summary: ${lum.length} frames, mean=${mean.toFixed(1)}, min=${min.toFixed(1)}, max=${max.toFixed(1)} / 255`);
    if (mean < 5) {
      console.warn('[brightness] WARNING: rendered frames suspiciously dark (mean luminance < 5) - likely a blank/near-black render');
    }
  }

  console.log(`All ${frameCount} frames captured`);
  await browser.close();
  server.close();
  process.exit(0);
}

renderFrames().catch(e => { console.error(e); process.exit(1); });
