let viewer;
let particleSystems = {};
let weatherOverlay;
let lightningFlash = null;
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

// Particle colors per condition
const PARTICLE_COLORS = {
  rain: new Cesium.Color(0.22, 0.74, 0.97, 0.6),
  storm: new Cesium.Color(0.97, 0.44, 0.44, 0.7),
  cloud: new Cesium.Color(0.58, 0.64, 0.72, 0.4),
  clear: new Cesium.Color(0.98, 0.75, 0.14, 0.3)
};

const PARTICLE_SIZES = {
  rain: 0.3,
  storm: 0.5,
  cloud: 1.0,
  clear: 0.2
};

const PARTICLE_COUNTS = {
  rain: 2000,
  storm: 3000,
  cloud: 800,
  clear: 300
};

function createParticleSystem(viewer, condition, intensity) {
  const type = getParticleType(condition);
  const color = PARTICLE_COLORS[type];
  const size = PARTICLE_SIZES[type] * intensity;
  const count = Math.round(PARTICLE_COUNTS[type] * intensity);

  // Destroy existing
  if (particleSystems.particles) {
    viewer.scene.primitives.remove(particleSystems.particles);
  }
  if (particleSystems.clouds) {
    viewer.scene.primitives.remove(particleSystems.clouds);
  }

  // Rain/storm particles - 3D billboards in world space
  const particleSystem = new Cesium.ParticleSystem({
    modelMatrix: Cesium.Matrix4.IDENTITY,
    emitter: new Cesium.BoxEmitter(
      new Cesium.Cartesian3(-200000, -200000, 5000),
      new Cesium.Cartesian3(200000, 200000, 15000)
    ),
    emissionRate: count / 5,
    lifetime: 5.0,
    particleLife: 8.0,
    speed: 50.0,
    scale: size,
    startScale: size,
    endScale: size * 0.1,
    image: createRainImage(type),
    startColor: color,
    endColor: new Cesium.Color(color.red, color.green, color.blue, 0.0),
    forces: [
      new Cesium.GravityVector(Cesium.Cartesian3.ZERO, -20),
      new Cesium.WindVector(new Cesium.Cartesian3(10, 5, 0))
    ]
  });

  viewer.scene.primitives.add(particleSystem);
  particleSystems.particles = particleSystem;

  // Add cloud particles for cloudy conditions
  if (type === 'cloud' || condition.toLowerCase().includes('cloud')) {
    const cloudSystem = new Cesium.ParticleSystem({
      modelMatrix: Cesium.Matrix4.IDENTITY,
      emitter: new Cesium.SphereEmitter(50000),
      emissionRate: 10,
      lifetime: 30.0,
      particleLife: 60.0,
      speed: 2.0,
      scale: 5000.0,
      startScale: 5000.0,
      endScale: 10000.0,
      image: createCloudImage(),
      startColor: new Cesium.Color(0.58, 0.64, 0.72, 0.15),
      endColor: new Cesium.Color(0.58, 0.64, 0.72, 0.0)
    });
    viewer.scene.primitives.add(cloudSystem);
    particleSystems.clouds = cloudSystem;
  }
}

function getParticleType(condition) {
  const c = condition.toLowerCase();
  if (c.includes('thunder') || c.includes('storm')) return 'storm';
  if (c.includes('rain') || c.includes('shower')) return 'rain';
  if (c.includes('cloud')) return 'cloud';
  return 'clear';
}

function createRainImage(type) {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  
  if (type === 'storm') {
    // Storm: thicker drops with slight glow
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.5, 'rgba(255,200,200,0.8)');
    grad.addColorStop(1, 'rgba(255,100,100,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(8, 2, 16, 28);
  } else if (type === 'rain') {
    // Rain: thin streaks
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.5, 'rgba(100,200,255,0.8)');
    grad.addColorStop(1, 'rgba(50,150,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(14, 2, 4, 28);
  } else if (type === 'cloud') {
    // Cloud: soft puff
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(200,200,220,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(16, 16, 16, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Clear: tiny sparkles
    ctx.fillStyle = 'rgba(255,255,200,0.5)';
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(Math.random() * 32, Math.random() * 32, 2, 2);
    }
  }
  return canvas;
}

function createCloudImage() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.3)');
  grad.addColorStop(0.5, 'rgba(200,200,220,0.15)');
  grad.addColorStop(1, 'rgba(150,150,180,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(64, 64, 64, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

function triggerLightning(viewer) {
  if (lightningFlash) {
    viewer.scene.primitives.remove(lightningFlash);
  }
  // Brief full-screen white flash via post-process or ambient light spike
  lightningFlash = viewer.scene.postProcessStages.add(new Cesium.PostProcessStage({
    fragmentShader: `
      uniform sampler2D colorTexture;
      uniform float flashIntensity;
      void main() {
        vec4 color = texture2D(colorTexture, v_textureCoordinates);
        gl_FragColor = vec4(color.rgb + flashIntensity, color.a);
      }
    `,
    uniforms: {
      flashIntensity: 0.8
    }
  }));
  // Remove after 2 frames (~66ms)
  setTimeout(() => {
    if (lightningFlash) {
      viewer.scene.postProcessStages.remove(lightningFlash);
      lightningFlash = null;
    }
  }, 66);
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
      background: rgba(10, 15, 26, 0.95);
      border: 1px solid #233554;
      border-radius: 16px;
      padding: 24px 48px;
      color: #f0f4f8;
      font-family: 'Space Grotesk', sans-serif;
      z-index: 100;
      pointer-events: none;
      backdrop-filter: blur(20px);
      min-width: 450px;
      text-align: center;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    `;
    this.panel.innerHTML = `
      <div id="locationName" style="font-size: 28px; font-weight: 700; color: #10b981; margin-bottom: 6px; letter-spacing: 0.5px;">Grandvoir, Belgium</div>
      <div id="dayInfo" style="font-size: 18px; color: #7c8ba4; margin-bottom: 16px; font-weight: 500;">Wed 26</div>
      <div id="condition" style="font-size: 20px; color: #f0f4f8; margin-bottom: 16px; text-transform: capitalize;">Partly cloudy</div>
      <div style="display: flex; justify-content: center; gap: 40px; font-size: 16px;">
        <span id="lowTemp" style="color: #38bdf8; font-weight: 500;">Low: 17°C</span>
        <span id="highTemp" style="color: #fb923c; font-weight: 500;">High: 25°C</span>
        <span id="rainChance" style="color: #38bdf8; font-weight: 500;">Rain: 21%</span>
      </div>
    `;
    this.container.appendChild(this.panel);
  }

  updateInfo(loc, day) {
    document.getElementById('locationName').textContent = loc.name;
    document.getElementById('dayInfo').textContent = day.label;
    document.getElementById('condition').textContent = day.condition;
    document.getElementById('lowTemp').textContent = `Low: ${day.low}°C`;
    document.getElementById('highTemp').textContent = `High: ${day.high}°C`;
    document.getElementById('rainChance').textContent = `Rain: ${day.rain}%`;
  }
}

function initCesium() {
  Cesium.Ion.defaultAccessToken = null;

  // Use reliable built-in terrain (WGS84 ellipsoid) - works offline, no API key needed
  const terrainProvider = new Cesium.EllipsoidTerrainProvider();

  // Use a single reliable imagery provider with fallback
  // CartoDB Dark Matter is generally reliable and free
  const imageryProvider = new Cesium.UrlTemplateImageryProvider({
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png',
    subdomains: 'abcd',
    credit: 'Map tiles by Carto, under CC BY 3.0. Data by OpenStreetMap, under ODbL.',
    minimumLevel: 0,
    maximumLevel: 18,
    tileDiscardPolicy: new Cesium.NeverTileDiscardPolicy()
  });

  viewer = new Cesium.Viewer('cesiumContainer', {
    imageryProvider: imageryProvider,
    terrainProvider: terrainProvider,
    animation: false,
    timeline: false,
    infoBox: false,
    homeButton: false,
    fullscreenButton: false,
    selectionIndicator: false,
    baseLayerPicker: false,
    geocoder: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    scene3DOnly: true,
    requestRenderMode: true,
    maximumRenderTimeChange: Infinity
  });

function initCesium() {
  Cesium.Ion.defaultAccessToken = null;

  // Use reliable built-in terrain (WGS84 ellipsoid) - works offline, no API key needed
  const terrainProvider = new Cesium.EllipsoidTerrainProvider();

  // Use a single reliable imagery provider with fallback
  // CartoDB Dark Matter is generally reliable and free
  const imageryProvider = new Cesium.UrlTemplateImageryProvider({
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png',
    subdomains: 'abcd',
    credit: 'Map tiles by Carto, under CC BY 3.0. Data by OpenStreetMap, under ODbL.',
    minimumLevel: 0,
    maximumLevel: 18,
    tileDiscardPolicy: new Cesium.NeverTileDiscardPolicy()
  });

  viewer = new Cesium.Viewer('cesiumContainer', {
    imageryProvider: imageryProvider,
    terrainProvider: terrainProvider,
    animation: false,
    timeline: false,
    infoBox: false,
    homeButton: false,
    fullscreenButton: false,
    selectionIndicator: false,
    baseLayerPicker: false,
    geocoder: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    scene3DOnly: true,
    requestRenderMode: true,
    maximumRenderTimeChange: Infinity
  });

  viewer.scene.globe.enableLighting = true;
  viewer.scene.sun.show = true;
  viewer.scene.moon.show = true;
  viewer.scene.skyAtmosphere.show = true;
  viewer.scene.skyAtmosphere.hueShift = -0.1;
  viewer.scene.skyAtmosphere.saturationShift = -0.2;
  viewer.scene.skyAtmosphere.brightnessShift = -0.3;
  viewer.scene.fog.enabled = true;
  viewer.scene.fog.density = 0.0003;
  viewer.scene.fog.minimumBrightness = 0.01;
  viewer.scene.backgroundColor = new Cesium.Color(0.04, 0.06, 0.1, 1.0);

  viewer.scene.globe.depthTestAgainstTerrain = true;
  viewer.scene.globe.baseColor = new Cesium.Color(0.04, 0.06, 0.1, 1.0);

  const canvas = document.getElementById('rainOverlay');
  rainSystem = new RainParticleSystem(canvas, window.innerWidth, window.innerHeight);
  weatherOverlay = new WeatherOverlay(document.body, window.innerWidth, window.innerHeight);

  window.addEventListener('resize', () => {
    rainSystem.resize(window.innerWidth, window.innerHeight);
  });

  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(5.37, 50.1, 15000),
    orientation: {
      heading: 0,
      pitch: -Cesium.Math.PI_OVER_FOUR,
      roll: 0
    }
  });
}

function calculateFlightPath() {
  const locs = window.CONFIG.locations;
  const path = [];

  for (let i = 0; i < locs.length - 1; i++) {
    const from = locs[i];
    const to = locs[i + 1];
    path.push({
      from: { lat: from.lat, lon: from.lon, height: 15000 },
      to: { lat: to.lat, lon: to.lon, height: 15000 },
      duration: 60
    });
  }
  return path;
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function updateCamera(dt) {
  const state = animationState;
  const locs = window.CONFIG.locations;
  const loc = locs[state.locationIndex];
  const day = loc.days[state.dayIndex];

  const phaseDuration = state.secondsPerDay * state.fps;

  if (state.frame < 30) {
    state.currentPhase = 'intro';
  } else if (state.locationIndex < locs.length - 1 && state.dayIndex === locs[state.locationIndex].days.length - 1) {
    state.currentPhase = 'fly';
  } else {
    state.currentPhase = 'orbit';
  }

  if (state.currentPhase === 'intro') {
    const progress = Math.min(1, state.frame / 30);
    const eased = easeInOutCubic(progress);
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(loc.lon, loc.lat, 15000 * (1 - eased * 0.5)),
      orientation: {
        heading: 0,
        pitch: -Cesium.Math.PI_OVER_FOUR * (1 - eased * 0.3),
        roll: 0
      }
    });
  } else if (state.currentPhase === 'orbit') {
    const dayProgress = (state.frame % phaseDuration) / phaseDuration;
    const angle = dayProgress * Math.PI * 2;
    const radius = 12000;
    const height = 8000;

    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(
        loc.lon + Math.sin(angle) * 0.02,
        loc.lat + Math.cos(angle) * 0.015,
        height
      ),
      orientation: {
        heading: angle + Math.PI,
        pitch: -Cesium.Math.PI_OVER_THREE,
        roll: 0
      }
    });

    if (state.frame % phaseDuration === 0) {
      weatherOverlay.updateInfo(loc, day);
      createParticleSystem(viewer, day.condition, day.rain / 100);
      // Trigger lightning for thunderstorms
      if (day.condition.toLowerCase().includes('thunder') || day.condition.toLowerCase().includes('storm')) {
        triggerLightning(viewer);
      }
    }
  } else if (state.currentPhase === 'fly') {
    if (state.flightProgress === 0) {
      state.flightDuration = 60;
    }

    state.flightProgress += dt;
    const progress = Math.min(1, state.flightProgress / (state.flightDuration / state.fps));
    const eased = easeInOutCubic(progress);

    const fromLoc = locs[state.locationIndex];
    const toLoc = locs[state.locationIndex + 1];

    const lon = fromLoc.lon + (toLoc.lon - fromLoc.lon) * eased;
    const lat = fromLoc.lat + (toLoc.lat - fromLoc.lat) * eased;
    const height = 15000 + Math.sin(progress * Math.PI) * 5000;

    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(lon, lat, height),
      orientation: {
        heading: progress * Math.PI * 0.5,
        pitch: -Cesium.Math.PI_OVER_FOUR - Math.sin(progress * Math.PI) * 0.3,
        roll: 0
      }
    });

    if (progress >= 1) {
      state.locationIndex++;
      state.dayIndex = 0;
      state.flightProgress = 0;
      state.currentPhase = 'orbit';
      const newLoc = locs[state.locationIndex];
      weatherOverlay.updateInfo(newLoc, newLoc.days[0]);
      createParticleSystem(viewer, newLoc.days[0].condition, newLoc.days[0].rain / 100);
      if (newLoc.days[0].condition.toLowerCase().includes('thunder') || newLoc.days[0].condition.toLowerCase().includes('storm')) {
        triggerLightning(viewer);
      }
    }
  }
}

function animate() {
  const dt = 1 / animationState.fps;
  animationState.frame++;

  updateCamera(dt);
  viewer.scene.render();

  if (animationState.frame < animationState.totalFrames) {
    requestAnimationFrame(animate);
  } else {
    window.renderComplete = true;
  }
}

window.startAnimation = function(totalFrames) {
  animationState.totalFrames = totalFrames;
  animationState.frame = 0;
  animationState.locationIndex = 0;
  animationState.dayIndex = 0;
  animationState.flightProgress = 0;
  window.renderComplete = false;

  const firstLoc = window.CONFIG.locations[0];
  const firstDay = firstLoc.days[0];
  weatherOverlay.updateInfo(firstLoc, firstDay);
  createParticleSystem(viewer, firstDay.condition, firstDay.rain / 100);

  animate();
};

window.initCesium = initCesium;
