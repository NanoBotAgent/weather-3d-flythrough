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

  await browserPage.exposeFunction('onFrameReady', async (frameNum, buffer) => {
    const framePath = path.join(OUTPUT_DIR, `frame_${String(frameNum).padStart(6, '0')}.png`);
    fs.writeFileSync(framePath, Buffer.from(buffer));
    if (frameNum % 30 === 0) console.log(`Captured frame ${frameNum}/${TOTAL_FRAMES}`);
  });

  console.log('Loading page...');
  await browserPage.goto(url, { waitUntil: 'networkidle0', timeout: 120000 });
  await browserPage.waitForFunction(() => window.Cesium !== undefined, { timeout: 60000 });
  await browserPage.waitForFunction(() => window.THREE !== undefined, { timeout: 60000 });

  console.log('Initializing Cesium viewer...');
  await browserPage.evaluate(() => window.initCesium());
  // Wait for the globe to start loading tiles
  await new Promise(r => setTimeout(r, 8000));

  console.log('Starting animation...');
  await browserPage.evaluate((frames) => {
    window.animationState.totalFrames = frames;
    window.animationState.frame = 0;
    window.animationState.locationIndex = 0;
    window.animationState.dayIndex = 0;
    window.startAnimation(frames);
  }, TOTAL_FRAMES);

  for (let frame = 0; frame < TOTAL_FRAMES; frame++) {
    // Give the RAF loop a moment to reach this frame
    await new Promise(r => setTimeout(r, 8));
    const buffer = await browserPage.screenshot({ type: 'png', encoding: 'binary' });
    await browserPage.evaluate((f, b) => window.onFrameReady(f, b), frame, buffer);
    if (frame % 150 === 0) {
      const mem = process.memoryUsage();
      console.log(`  frame ${frame}: heap ${Math.round(mem.heapUsed / 1048576)}MB`);
    }
  }

  console.log('All frames captured');
  await browser.close();
  server.close();
}

renderFrames().catch(e => { console.error(e); process.exit(1); });