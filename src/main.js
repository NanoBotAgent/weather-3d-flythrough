const THREE = window.THREE;

class ParticleSystem3D {
  constructor(canvas, width, height) {
    if (!THREE) {
      throw new Error('THREE is not loaded - three.min.js failed to load');
    }
    this.canvas = canvas;
    this.width = width;
    this.height = height;
    this.scene = new THREE.Scene();

    // Use PerspectiveCamera for true 3D billboard rendering
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 500);
    this.camera.position.set(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      alpha: true,
      antialias: false,
      preserveDrawingBuffer: true
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(1);

    this.maxParticles = 1500;
    this.condition = 'clear';
    this.intensity = 1;
    this.time = 0;

    this.lightningActive = false;
    this.lightningTime = 0;

    this.initParticles();
  }

  initParticles() {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.maxParticles * 3);
    const sizes = new Float32Array(this.maxParticles);
    const alphas = new Float32Array(this.maxParticles);
    const velocities = new Float32Array(this.maxParticles * 3);
    const types = new Float32Array(this.maxParticles);
    const colors = new Float32Array(this.maxParticles * 3);

    for (let i = 0; i < this.maxParticles; i++) {
      this.resetParticle(i, positions, sizes, alphas, velocities, types, colors);
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
    geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
    geometry.setAttribute('type', new THREE.BufferAttribute(types, 1));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 1,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });

    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);

    this.geometry = geometry;
    this.material = material;

    // Lightning flash plane
    const flashGeometry = new THREE.PlaneGeometry(2000, 2000);
    const flashMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false
    });
    this.lightningFlash = new THREE.Mesh(flashGeometry, flashMaterial);
    this.lightningFlash.position.set(0, 0, -100);
    this.scene.add(this.lightningFlash);
  }

  resetParticle(i, positions, sizes, alphas, velocities, types, colors) {
    // Position in 3D frustum around camera (world space)
    const frustumDepth = 150;
    const frustumWidth = 200;
    const frustumHeight = 150;

    positions[i * 3] = (Math.random() - 0.5) * frustumWidth;
    positions[i * 3 + 1] = (Math.random() - 0.5) * frustumHeight;
    positions[i * 3 + 2] = -(Math.random() * frustumDepth + 10);

    sizes[i] = Math.random() * 1.5 + 0.5;
    alphas[i] = Math.random() * 0.4 + 0.1;
    types[i] = 0;
    colors[i * 3] = 1.0;
    colors[i * 3 + 1] = 1.0;
    colors[i * 3 + 2] = 1.0;

    velocities[i * 3] = (Math.random() - 0.5) * 0.5;
    velocities[i * 3 + 1] = -(Math.random() * 2 + 0.5);
    velocities[i * 3 + 2] = 0;
  }

  setCondition(condition, intensity) {
    this.condition = condition.toLowerCase();
    this.intensity = intensity;

    const positions = this.geometry.attributes.position.array;
    const sizes = this.geometry.attributes.size.array;
    const alphas = this.geometry.attributes.alpha.array;
    const velocities = this.geometry.attributes.velocity.array;
    const types = this.geometry.attributes.type.array;
    const colors = this.geometry.attributes.color.array;

    let particleCount, baseColor, velocityY, velocityX, sizeMult, alphaBase, particleType;

    if (this.condition.includes('thunder') || this.condition.includes('storm')) {
      particleCount = Math.round(1500 * intensity);
      baseColor = { r: 1.0, g: 0.3, b: 0.3 };
      velocityY = -(Math.random() * 8 + 4);
      velocityX = (Math.random() - 0.5) * 6;
      sizeMult = 1.5;
      alphaBase = 0.6;
      particleType = 2; // Storm
    } else if (this.condition.includes('rain') || this.condition.includes('shower')) {
      particleCount = Math.round(1200 * intensity);
      baseColor = { r: 0.2, g: 0.7, b: 1.0 };
      velocityY = -(Math.random() * 5 + 2);
      velocityX = (Math.random() - 0.5) * 2;
      sizeMult = 1.0;
      alphaBase = 0.5;
      particleType = 1; // Rain
    } else if (this.condition.includes('cloud')) {
      particleCount = Math.round(600 * intensity);
      baseColor = { r: 0.7, g: 0.75, b: 0.85 };
      velocityY = -(Math.random() * 0.5 + 0.1);
      velocityX = (Math.random() - 0.5) * 0.5;
      sizeMult = 3.0;
      alphaBase = 0.25;
      particleType = 3; // Cloud
    } else {
      particleCount = Math.round(300 * intensity);
      baseColor = { r: 1.0, g: 0.9, b: 0.3 };
      velocityY = -(Math.random() * 0.3 + 0.05);
      velocityX = (Math.random() - 0.5) * 0.2;
      sizeMult = 0.5;
      alphaBase = 0.15;
      particleType = 0; // Clear
    }

    this.maxParticles = particleCount;

    for (let i = 0; i < particleCount; i++) {
      const frustumDepth = 150;
      const frustumWidth = 200;
      const frustumHeight = 150;

      positions[i * 3] = (Math.random() - 0.5) * frustumWidth;
      positions[i * 3 + 1] = (Math.random() - 0.5) * frustumHeight;
      positions[i * 3 + 2] = -(Math.random() * frustumDepth + 10);

      sizes[i] = (Math.random() * 1.5 + 0.5) * sizeMult;
      alphas[i] = Math.random() * 0.3 + alphaBase;
      types[i] = particleType;

      colors[i * 3] = baseColor.r * (0.8 + Math.random() * 0.4);
      colors[i * 3 + 1] = baseColor.g * (0.8 + Math.random() * 0.4);
      colors[i * 3 + 2] = baseColor.b * (0.8 + Math.random() * 0.4);

      velocities[i * 3] = velocityX + (Math.random() - 0.5) * 1;
      velocities[i * 3 + 1] = velocityY + (Math.random() - 0.5) * 1;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
    }

    // Hide extra particles
    for (let i = particleCount; i < this.geometry.attributes.position.count; i++) {
      alphas[i] = 0;
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;
    this.geometry.attributes.alpha.needsUpdate = true;
    this.geometry.attributes.velocity.needsUpdate = true;
    this.geometry.attributes.type.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }

  triggerLightning() {
    this.lightningActive = true;
    this.lightningTime = 0;
    this.lightningFlash.material.opacity = 0.9;
  }

  update(dt, cameraPosition, cameraRotation) {
    this.time += dt;

    // Particles are an ambient overlay fixed to screen space (camera at origin,
    // looking down -Z). The globe's motion is driven independently in the globe
    // scene, so keep the particle camera at a stable orientation.
    this.camera.rotation.set(cameraRotation.x, cameraRotation.y, cameraRotation.z, 'XYZ');

    const positions = this.geometry.attributes.position.array;
    const alphas = this.geometry.attributes.alpha.array;
    const velocities = this.geometry.attributes.velocity.array;
    const types = this.geometry.attributes.type.array;
    const sizes = this.geometry.attributes.size.array;
    const colors = this.geometry.attributes.color.array;

    const frustumDepth = 150;
    const frustumWidth = 200;
    const frustumHeight = 150;

    for (let i = 0; i < this.maxParticles; i++) {
      positions[i * 3] += velocities[i * 3] * dt * 60;
      positions[i * 3 + 1] += velocities[i * 3 + 1] * dt * 60;
      positions[i * 3 + 2] += velocities[i * 3 + 2] * dt * 60;

      // Sway
      const sway = Math.sin(this.time * 1.5 + i * 0.1) * 0.3;
      positions[i * 3] += sway * dt * 30;

      // Respawn if out of frustum
      if (positions[i * 3 + 1] < -frustumHeight / 2 - 20 ||
          positions[i * 3] < -frustumWidth / 2 - 50 ||
          positions[i * 3] > frustumWidth / 2 + 50 ||
          positions[i * 3 + 2] > 10) {
        positions[i * 3] = (Math.random() - 0.5) * frustumWidth;
        positions[i * 3 + 1] = frustumHeight / 2 + Math.random() * 50;
        positions[i * 3 + 2] = -(Math.random() * frustumDepth + 10);

        const type = types[i];
        if (type === 2) { velocities[i * 3 + 1] = -(Math.random() * 8 + 4); sizes[i] *= 1.2; }
        else if (type === 1) { velocities[i * 3 + 1] = -(Math.random() * 5 + 2); }
        else if (type === 3) { velocities[i * 3 + 1] = -(Math.random() * 0.5 + 0.1); sizes[i] *= 2.5; }
        else { velocities[i * 3 + 1] = -(Math.random() * 0.3 + 0.05); sizes[i] *= 0.5; }
      }

      // Fade alpha based on depth (closer = more visible)
      const depthFactor = 1.0 + positions[i * 3 + 2] / frustumDepth;
      alphas[i] = Math.max(0.05, alphas[i] * depthFactor);
    }

    // Lightning flash fade
    if (this.lightningActive) {
      this.lightningTime += dt;
      this.lightningFlash.material.opacity = Math.max(0, 0.9 - this.lightningTime * 8);
      if (this.lightningTime > 0.15) {
        this.lightningActive = false;
        this.lightningFlash.material.opacity = 0;
      }
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.alpha.needsUpdate = true;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }
}

class WeatherOverlay {
  constructor(container) {
    this.container = container;
    this.createInfoPanel();
  }

  createInfoPanel() {
    this.panel = document.createElement('div');
    this.panel.style.cssText = `
      position: absolute;
      bottom: 40px;
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(135deg, rgba(10, 15, 26, 0.98), rgba(20, 29, 46, 0.95));
      border: 1px solid #1e3a5f;
      border-radius: 20px;
      padding: 28px 56px;
      color: #f0f4f8;
      font-family: 'Space Grotesk', sans-serif;
      z-index: 100;
      pointer-events: none;
      backdrop-filter: blur(24px);
      min-width: 480px;
      text-align: center;
      box-shadow:
        0 12px 48px rgba(0,0,0,0.5),
        0 0 0 1px rgba(16, 185, 129, 0.1) inset,
        0 0 60px rgba(16, 185, 129, 0.05);
      animation: panelFadeIn 0.6s ease-out;
    `;
    this.panel.innerHTML = `
      <style>
        @keyframes panelFadeIn {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes textFadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .data-row { display: flex; justify-content: center; gap: 48px; margin-top: 16px; }
        .data-item { display: flex; flex-direction: column; gap: 4px; }
        .data-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 600; }
        .data-value { font-size: 18px; font-weight: 500; font-family: 'JetBrains Mono', monospace; }
      </style>
      <div id="locationName" style="font-size: 30px; font-weight: 700; color: #10b981; margin-bottom: 4px; letter-spacing: 0.5px; animation: textFadeIn 0.4s ease-out;">Grandvoir, Belgium</div>
      <div id="dayInfo" style="font-size: 20px; color: #7c8ba4; margin-bottom: 20px; font-weight: 500; animation: textFadeIn 0.4s ease-out 0.1s both;">Wed 26</div>
      <div id="condition" style="font-size: 22px; color: #f0f4f8; margin-bottom: 20px; text-transform: capitalize; font-weight: 500; animation: textFadeIn 0.4s ease-out 0.2s both;">Partly cloudy</div>
      <div class="data-row">
        <div class="data-item">
          <span class="data-label">Low</span>
          <span id="lowTemp" class="data-value" style="color: #38bdf8;">17°C</span>
        </div>
        <div class="data-item">
          <span class="data-label">High</span>
          <span id="highTemp" class="data-value" style="color: #fb923c;">25°C</span>
        </div>
        <div class="data-item">
          <span class="data-label">Precipitation</span>
          <span id="rainChance" class="data-value" style="color: #38bdf8;">21%</span>
        </div>
      </div>
    `;
    this.container.appendChild(this.panel);
  }

  updateInfo(loc, day) {
    const locEl = document.getElementById('locationName');
    const dayEl = document.getElementById('dayInfo');
    const condEl = document.getElementById('condition');
    const lowEl = document.getElementById('lowTemp');
    const highEl = document.getElementById('highTemp');
    const rainEl = document.getElementById('rainChance');

    [locEl, dayEl, condEl, lowEl, highEl, rainEl].forEach(el => {
      el.style.animation = 'none';
      el.offsetHeight;
      el.style.animation = 'textFadeIn 0.3s ease-out';
    });

    locEl.textContent = loc.name;
    dayEl.textContent = day.label;
    condEl.textContent = day.condition;
    lowEl.textContent = `${day.low}°C`;
    highEl.textContent = `${day.high}°C`;
    rainEl.textContent = `${day.rain}%`;
  }
}

// ---------------------------------------------------------------------------
// Three.js globe renderer (replaces CesiumJS). Cesium's globe surface does not
// render under SwiftShader (software WebGL2) in headless CI; three.js WebGL1
// works reliably (the particle overlay already proves this). We render the same
// procedural blue-marble equirectangular texture onto a lit sphere.
// ---------------------------------------------------------------------------
const GLOBE_RADIUS = 1.0;
const BASE_CAM_DIST = 3.0;

function lonLatToPosition(lonDeg, latDeg, radius) {
  const lat = latDeg * Math.PI / 180;
  const lon = lonDeg * Math.PI / 180;
  const x = radius * Math.cos(lat) * Math.cos(lon);
  const y = radius * Math.sin(lat);
  const z = radius * Math.cos(lat) * Math.sin(lon);
  return new THREE.Vector3(x, y, z);
}

function buildBlueMarbleTexture() {
  const globeCanvas = document.createElement('canvas');
  globeCanvas.width = 2048;
  globeCanvas.height = 1024;
  const ctx = globeCanvas.getContext('2d');

  const imageData = ctx.createImageData(2048, 1024);
  const data = imageData.data;

  for (let py = 0; py < 1024; py++) {
    const lat = 90 - (py / 1023) * 180;

    for (let px = 0; px < 2048; px++) {
      const lon = -180 + (px / 2047) * 360;
      let r, g, b;

      if (lat > 65 || lat < -65) {
        r = 240 + Math.random() * 15;
        g = 245 + Math.random() * 10;
        b = 255;
      } else if (lat > 35 || lat < -35) {
        const noise = Math.sin(lon * 0.05) * Math.cos(lat * 0.03) + Math.sin(lon * 0.02) * 0.5;
        if (noise > 0.1) {
          r = 80 + Math.random() * 60;
          g = 110 + Math.random() * 70;
          b = 40 + Math.random() * 40;
        } else {
          r = 25 + Math.random() * 30;
          g = 65 + Math.random() * 50;
          b = 130 + Math.random() * 50;
        }
      } else {
        const noise = Math.sin(lon * 0.04) * Math.cos(lat * 0.02) + Math.sin(lon * 0.015) * 0.3;
        if (noise > 0.0) {
          r = 60 + Math.random() * 50;
          g = 100 + Math.random() * 70;
          b = 35 + Math.random() * 35;
        } else {
          r = 15 + Math.random() * 25;
          g = 55 + Math.random() * 55;
          b = 110 + Math.random() * 70;
        }
      }

      const idx = (py * 2048 + px) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);

  const tex = new THREE.CanvasTexture(globeCanvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

class GlobeRenderer {
  constructor(canvas, width, height) {
    this.canvas = canvas;
    this.width = width;
    this.height = height;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020612);

    this.camera = new THREE.PerspectiveCamera(52, width / height, 0.01, 100);
    this.camera.up.set(0, 1, 0);

    this.renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: true
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(1);

    this.globeGroup = new THREE.Group();
    this.scene.add(this.globeGroup);

    this.buildGlobe();
    this.buildAtmosphere();
    this.buildStars();
  }

  buildGlobe() {
    const tex = buildBlueMarbleTexture();
    const geo = new THREE.SphereGeometry(GLOBE_RADIUS, 96, 64);
    // Unlit material: always full-bright so the globe is unmistakably visible,
    // regardless of light direction or software-GL lighting support.
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    this.globe = new THREE.Mesh(geo, mat);
    this.globeGroup.add(this.globe);
  }

  buildAtmosphere() {
    const geo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.06, 48, 32);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x3b82f6,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide
    });
    this.atmosphere = new THREE.Mesh(geo, mat);
    this.globeGroup.add(this.atmosphere);
  }

  buildStars() {
    const count = 2200;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const u = Math.random() * 2 - 1;
      const theta = Math.random() * Math.PI * 2;
      const s = Math.sqrt(Math.max(0, 1 - u * u));
      const radius = 9 + Math.random() * 6;
      positions[i * 3] = s * Math.cos(theta) * radius;
      positions[i * 3 + 1] = u * radius;
      positions[i * 3 + 2] = s * Math.sin(theta) * radius;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.03,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.8,
      depthWrite: false
    });
    this.stars = new THREE.Points(geo, mat);
    this.scene.add(this.stars);
  }

  setView(lonDeg, latDeg, dist) {
    this.camera.position.copy(lonLatToPosition(lonDeg, latDeg, dist));
    this.camera.lookAt(0, 0, 0);
  }

  render() {
    // Spin the globe continuously so the sphere reads as rotating 3D Earth.
    this.globe.rotation.y += 0.008;
    this.renderer.render(this.scene, this.camera);
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }
}

let globeRenderer;
let particleSystem;
let weatherOverlay;
let animationState = {
  frame: 0,
  totalFrames: 0,
  fps: 30,
  secondsPerDay: 3,
  currentPhase: 'intro',
  locationIndex: 0,
  dayIndex: 0,
  flightProgress: 0
};

// Expose the SAME object the injected render loop mutates, so updateCamera()
// sees the advancing frame/day/location state (single source of truth).
window.animationState = animationState;

function initScene() {
  if (!window.THREE) {
    throw new Error('THREE is not loaded - three.min.js failed to load');
  }

  const globeCanvas = document.getElementById('globeCanvas');
  if (!globeCanvas) {
    throw new Error('globeCanvas element not found');
  }

  const W = window.innerWidth;
  const H = window.innerHeight;
  globeRenderer = new GlobeRenderer(globeCanvas, W, H);
  window.globeRenderer = globeRenderer;

  const rainCanvas = document.getElementById('rainOverlay');
  particleSystem = new ParticleSystem3D(rainCanvas, W, H);
  window.particleSystem = particleSystem;

  weatherOverlay = new WeatherOverlay(document.body);
  window.weatherOverlay = weatherOverlay;

  window.addEventListener('resize', () => {
    globeRenderer.resize(window.innerWidth, window.innerHeight);
    particleSystem.resize(window.innerWidth, window.innerHeight);
  });

  const firstLoc = window.CONFIG.locations[0];
  globeRenderer.setView(firstLoc.lon, firstLoc.lat, BASE_CAM_DIST);
  console.log('initScene completed successfully');
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function updateCamera(dt) {
  const state = animationState;
  const locs = window.CONFIG.locations;
  const fps = state.fps;
  const framesPerDay = Math.round(fps * state.secondsPerDay);
  const introFrames = 30;
  const flightFrames = 60;
  const orbitLen = locs[0].days.length * framesPerDay; // 7 days per location

  const frame = state.frame;

  if (frame < introFrames) {
    state.currentPhase = 'intro';
    const loc = locs[0];
    const progress = Math.min(1, frame / introFrames);
    const eased = easeInOutCubic(progress);
    const dist = (BASE_CAM_DIST + 2.0) - eased * 2.0;
    globeRenderer.setView(loc.lon, loc.lat, dist);
  } else {
    const rel = frame - introFrames;
    const segLen = orbitLen + flightFrames;
    const locIndex = Math.min(Math.floor(rel / segLen), locs.length - 1);
    const within = rel - locIndex * segLen;
    const loc = locs[locIndex];

    const isFlying = (locIndex < locs.length - 1) && (within >= orbitLen);

    if (isFlying) {
      state.currentPhase = 'fly';
      const fromLoc = locs[locIndex];
      const toLoc = locs[locIndex + 1];
      const flightProgress = Math.min(1, (within - orbitLen) / flightFrames);
      const eased = easeInOutCubic(flightProgress);

      const lon = fromLoc.lon + (toLoc.lon - fromLoc.lon) * eased;
      const lat = fromLoc.lat + (toLoc.lat - fromLoc.lat) * eased;
      const dist = BASE_CAM_DIST + Math.sin(flightProgress * Math.PI) * 0.6;

      globeRenderer.setView(lon, lat, dist);
    } else {
      state.currentPhase = 'orbit';
      state.locationIndex = locIndex;
      const clampedWithin = Math.min(within, orbitLen - 1);
      const dayIndex = Math.min(Math.floor(clampedWithin / framesPerDay), loc.days.length - 1);
      state.dayIndex = dayIndex;
      const day = loc.days[dayIndex];

      // Full 360° orbital flight around the location over the 7-day segment.
      // t goes 0->1 across the orbit; camera circles at BASE_CAM_DIST.
      const t = clampedWithin / (orbitLen - 1);
      const orbitAngle = t * Math.PI * 2;
      const orbitRadius = 0.5; // offset from center
      const camLon = loc.lon + Math.sin(orbitAngle) * orbitRadius;
      const camLat = loc.lat + Math.cos(orbitAngle) * orbitRadius * 0.5;
      const camDist = BASE_CAM_DIST + Math.sin(t * Math.PI) * 0.4;

      globeRenderer.setView(camLon, camLat, camDist);

      const key = locIndex + ':' + dayIndex;
      if (key !== state._lastDayKey) {
        weatherOverlay.updateInfo(loc, day);
        particleSystem.setCondition(day.condition, day.rain / 100);
        state._lastDayKey = key;
        state._thunderTimer = 0;
      }

      // Periodic lightning flashes during thunder/storm days (every ~0.7s).
      if ((day.condition.toLowerCase().includes('thunder') || day.condition.toLowerCase().includes('storm'))) {
        state._thunderTimer = (state._thunderTimer || 0) + dt;
        if (!state._lightningOn && state._thunderTimer > 0.5) {
          particleSystem.triggerLightning();
          state._lightningOn = true;
          state._lightningOffTimer = 0;
        }
        if (state._lightningOn) {
          state._lightningOffTimer = (state._lightningOffTimer || 0) + dt;
          if (state._lightningOffTimer > 0.2) {
            state._lightningOn = false;
            state._thunderTimer = 0;
          }
        }
      } else {
        state._thunderTimer = 0;
        state._lightningOn = false;
      }
    }
  }

  if (particleSystem) {
    particleSystem.update(
      dt,
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 }
    );
  }
}

function animate() {
  const dt = 1 / animationState.fps;
  animationState.frame++;

  updateCamera(dt);
  particleSystem.render();
  globeRenderer.render();

  if (animationState.frame < animationState.totalFrames) {
    requestAnimationFrame(animate);
  } else {
    window.renderComplete = true;
  }
}

window.startAnimation = function(totalFrames) {
  if (!window.weatherOverlay || !window.particleSystem || !window.globeRenderer) {
    throw new Error('startAnimation called before initScene completed');
  }
  animationState.totalFrames = totalFrames;
  animationState.frame = 0;
  animationState.locationIndex = 0;
  animationState.dayIndex = 0;
  animationState.flightProgress = 0;
  window.renderComplete = false;

  const firstLoc = window.CONFIG.locations[0];
  const firstDay = firstLoc.days[0];
  window.weatherOverlay.updateInfo(firstLoc, firstDay);
  window.particleSystem.setCondition(firstDay.condition, firstDay.rain / 100);

  animate();
};

window.initScene = initScene;
