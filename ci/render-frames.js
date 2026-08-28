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
  await browserPage.on('console', msg => {
    const t = msg.type();
    if (t === 'error' || t === 'warning') console.log(`[browser:${t}]`, msg.text());
  });
  await browserPage.on('pageerror', err => console.log('[browser:error]', err.message));
  await browserPage.on('requestfailed', req => console.log('[browser:requestfailed]', req.url(), req.failure().errorText));

  let frameCount = 0;
  let resolveFrame;
  let framePromise = new Promise(r => { resolveFrame = r; });
  let captureDone = false;

  await browserPage.exposeFunction('onFrameReady', async (frameNum, buffer) => {
    const framePath = path.join(OUTPUT_DIR, `frame_${String(frameNum).padStart(6, '0')}.png`);
    fs.writeFileSync(framePath, Buffer.from(buffer));
    frameCount++;
    if (frameCount % 30 === 0) console.log(`Captured frame ${frameCount}/${TOTAL_FRAMES}`);
    if (frameCount >= TOTAL_FRAMES) {
      captureDone = true;
      resolveFrame();
    } else {
      framePromise = new Promise(r => { resolveFrame = r; });
    }
  });

  console.log('Loading page...');
  await browserPage.goto(url, { waitUntil: 'networkidle0', timeout: 180000 });
  await browserPage.waitForFunction(() => window.Cesium !== undefined, { timeout: 180000 });

  console.log('Initializing Cesium viewer...');
  await browserPage.evaluate(() => window.initCesium());
  // Wait for the globe to start loading tiles
  await new Promise(r => setTimeout(r, 15000));

  // Inject frame capture logic into the browser
  await browserPage.evaluate((totalFrames) => {
    window.captureFrame = async function(frameNum) {
      const canvas = document.getElementById('cesiumContainer').querySelector('canvas');
      if (!canvas) return;
      
      // Render the scene to get the latest frame
      if (window.viewer) {
        window.viewer.scene.render();
      }
      if (window.particleSystem) {
        window.particleSystem.render();
      }
      
      // Small delay to ensure render completes
      await new Promise(r => setTimeout(r, 16));
      
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      const arrayBuffer = await blob.arrayBuffer();
      const buffer = Array.from(new Uint8Array(arrayBuffer));
      
      // Send back to Node via exposed function
      await window.onFrameReady(frameNum, buffer);
    };
  }, TOTAL_FRAMES);

  console.log('Starting synchronized frame capture...');
  
  // Override the animation loop to be frame-synchronous
  await browserPage.evaluate((totalFrames) => {
    window.startAnimation = function(totalFrames) {
      window.animationState = {
        frame: 0,
        totalFrames: totalFrames,
        fps: 30,
        secondsPerDay: 3,
        currentPhase: 'intro',
        locationIndex: 0,
        dayIndex: 0,
        flightProgress: 0
      };
      
      const firstLoc = window.CONFIG.locations[0];
      const firstDay = firstLoc.days[0];
      window.weatherOverlay.updateInfo(firstLoc, firstDay);
      window.particleSystem.setCondition(firstDay.condition, firstDay.rain / 100);
      
      window.renderNextFrame = async function() {
        const state = window.animationState;
        if (state.frame >= state.totalFrames) {
          window.renderComplete = true;
          return;
        }
        
        const dt = 1 / state.fps;
        
        // Update camera/particles for this frame
        window.updateCamera(dt);
        window.particleSystem.render();
        window.viewer.scene.render();
        
        // Capture this frame
        await window.captureFrame(state.frame);
        
        state.frame++;
        
        // Schedule next frame
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
    console.error('Timeout waiting for frames');
    resolveFrame();
  }, 3600000); // 1 hour timeout

  await framePromise;
  clearTimeout(timeout);

  console.log(`All ${frameCount} frames captured`);
  await browser.close();
  server.close();
}

renderFrames().catch(e => { console.error(e); process.exit(1); });