const THREE = window.THREE;

class RainParticleSystem {
  constructor(canvas, width, height) {
    this.canvas = canvas;
    this.width = width;
    this.height = height;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 0.1, 1000);
    this.camera.position.z = 100;
    this.renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      alpha: true,
      antialias: false
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(1);

    this.particles = [];
    this.maxParticles = 2000;
    this.condition = 'clear';
    this.intensity = 0;
    this.time = 0;
    this.windX = 0;
    this.windY = 0;

    this.initParticles();
  }

  initParticles() {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.maxParticles * 3);
    const sizes = new Float32Array(this.maxParticles);
    const alphas = new Float32Array(this.maxParticles);
    const velocities = new Float32Array(this.maxParticles * 3);
    const types = new Float32Array(this.maxParticles);

    for (let i = 0; i < this.maxParticles; i++) {
      this.resetParticle(i, positions, sizes, alphas, velocities, types);
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
    geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
    geometry.setAttribute('type', new THREE.BufferAttribute(types, 1));

    const material = new THREE.PointsMaterial({
      size: 1,
      vertexColors: false,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.points = new THREE.Points(geometry, material);
    this.scene.add(this.points);

    this.geometry = geometry;
    this.material = material;
  }

  resetParticle(i, positions, sizes, alphas, velocities, types) {
    const spread = Math.max(this.width, this.height) * 0.8;
    positions[i * 3] = (Math.random() - 0.5) * spread * 2;
    positions[i * 3 + 1] = this.height / 2 + Math.random() * this.height * 0.5;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 10;

    sizes[i] = Math.random() * 2 + 1;
    alphas[i] = Math.random() * 0.5 + 0.2;

    const type = Math.random() < 0.3 ? 1 : 0;
    types[i] = type;

    if (type === 0) {
      velocities[i * 3] = (Math.random() - 0.5) * 2 + this.windX;
      velocities[i * 3 + 1] = -(Math.random() * 15 + 10) + this.windY;
      velocities[i * 3 + 2] = 0;
    } else {
      velocities[i * 3] = (Math.random() - 0.5) * 1;
      velocities[i * 3 + 1] = -(Math.random() * 5 + 2);
      velocities[i * 3 + 2] = 0;
    }
  }

  setCondition(condition, intensity) {
    this.condition = condition.toLowerCase();
    this.intensity = intensity;

    if (this.condition.includes('thunder') || this.condition.includes('storm')) {
      this.windX = (Math.random() - 0.5) * 8;
      this.windY = 2;
      this.material.color.setHex(0xf87171);
      this.maxParticles = 3000;
    } else if (this.condition.includes('rain') || this.condition.includes('shower')) {
      this.windX = (Math.random() - 0.5) * 4;
      this.windY = 1;
      this.material.color.setHex(0x38bdf8);
      this.maxParticles = 2000;
    } else if (this.condition.includes('cloud')) {
      this.windX = (Math.random() - 0.5) * 1;
      this.windY = 0.5;
      this.material.color.setHex(0x94a3b8);
      this.maxParticles = 1000;
    } else {
      this.windX = 0;
      this.windY = 0;
      this.material.color.setHex(0xfbbf24);
      this.maxParticles = 500;
    }
  }

  update(dt) {
    this.time += dt;
    const positions = this.geometry.attributes.position.array;
    const alphas = this.geometry.attributes.alpha.array;
    const velocities = this.geometry.attributes.velocity.array;
    const types = this.geometry.attributes.type.array;
    const sizes = this.geometry.attributes.size.array;

    for (let i = 0; i < this.maxParticles; i++) {
      positions[i * 3] += velocities[i * 3] * dt * 60;
      positions[i * 3 + 1] += velocities[i * 3 + 1] * dt * 60;
      positions[i * 3 + 2] += velocities[i * 3 + 2] * dt * 60;

      const sway = Math.sin(this.time * 2 + i) * 0.5;
      positions[i * 3] += sway * dt * 30;

      if (positions[i * 3 + 1] < -this.height / 2 - 50 ||
          positions[i * 3] < -this.width / 2 - 50 ||
          positions[i * 3] > this.width / 2 + 50) {
        this.resetParticle(i, positions, sizes, alphas, velocities, types);
        positions[i * 3 + 1] = this.height / 2 + Math.random() * 50;
      }

      const type = types[i];
      if (type === 0) {
        alphas[i] = Math.min(0.8, alphas[i] + dt * 0.5);
      } else {
        alphas[i] = Math.max(0.1, alphas[i] - dt * 0.2);
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
    this.camera.left = -width / 2;
    this.camera.right = width / 2;
    this.camera.top = height / 2;
    this.camera.bottom = -height / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }
}

class WeatherOverlay {
  constructor(container, width, height) {
    this.container = container;
    this.width = width;
    this.height = height;
    this.currentLocationIndex = 0;
    this.currentDayIndex = 0;
    this.transitionProgress = 0;
    this.isTransitioning = false;
    this.flightPath = [];
    this.flightProgress = 0;
    this.flightDuration = 0;

    this.createInfoPanel();
  }

  createInfoPanel() {
    this.panel = document.createElement('div');
    this.panel.style.cssText = `
      position: absolute;
      bottom: 40px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(10, 15, 26, 0.9);
      border: 1px solid #233554;
      border-radius: 12px;
      padding: 20px 40px;
      color: #f0f4f8;
      font-family: 'Space Grotesk', sans-serif;
      z-index: 100;
      pointer-events: none;
      backdrop-filter: blur(10px);
      min-width: 400px;
      text-align: center;
    `;
    this.panel.innerHTML = `
      <div id="locationName" style="font-size: 24px; font-weight: bold; color: #10b981; margin-bottom: 8px;">Grandvoir, Belgium</div>
      <div id="dayInfo" style="font-size: 16px; color: #7c8ba4; margin-bottom: 12px;">Wed 26</div>
      <div id="condition" style="font-size: 18px; color: #f0f4f8; margin-bottom: 8px;">Partly cloudy</div>
      <div style="display: flex; justify-content: center; gap: 30px; font-size: 14px;">
        <span id="lowTemp" style="color: #38bdf8;">Low: 17°C</span>
        <span id="highTemp" style="color: #fb923c;">High: 25°C</span>
        <span id="rainChance" style="color: #38bdf8;">🌧 21%</span>
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
    document.getElementById('rainChance').textContent = `🌧 ${day.rain}%`;
  }

  setLocation(locIndex, dayIndex) {
    this.currentLocationIndex = locIndex;
    this.currentDayIndex = dayIndex;
  }
}

let viewer;
let rainSystem;
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

function initCesium() {
  Cesium.Ion.defaultAccessToken = null;

  const imageryViewModels = [];

  imageryViewModels.push(new Cesium.ProviderViewModel({
    name: 'OpenStreetMap',
    tooltip: 'OpenStreetMap (OSM)',
    creationFunction: function() {
      return new Cesium.UrlTemplateImageryProvider({
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        subdomains: 'abc',
        minimumLevel: 0,
        maximumLevel: 19
      });
    }
  }));

  imageryViewModels.push(new Cesium.ProviderViewModel({
    name: 'CartoDB Dark Matter',
    tooltip: 'CartoDB Dark Matter basemap',
    creationFunction: function() {
      return new Cesium.UrlTemplateImageryProvider({
        url: 'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png',
        credit: 'Map tiles by <a href="https://carto.com">Carto</a>, under CC BY 3.0. Data by <a href="https://www.openstreetmap.org/">OpenStreetMap</a>, under ODbL.',
        minimumLevel: 0,
        maximumLevel: 18
      });
    }
  }));

  imageryViewModels.push(new Cesium.ProviderViewModel({
    name: 'USGS Satellite',
    tooltip: 'USGS National Map Satellite',
    creationFunction: function() {
      return new Cesium.UrlTemplateImageryProvider({
        url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}',
        credit: 'Tile data from <a href="https://basemap.nationalmap.gov/">USGS</a>',
        minimumLevel: 0,
        maximumLevel: 16
      });
    }
  }));

  viewer = new Cesium.Viewer('cesiumContainer', {
    imageryProviderViewModels: imageryViewModels,
    selectedImageryProviderViewModel: imageryViewModels[1],
    terrainProvider: new Cesium.CesiumTerrainProvider({
      url: 'https://api.maptiler.com/tiles/terrain-quantized-mesh/?key=demo'
    }),
    animation: false,
    timeline: false,
    infoBox: false,
    homeButton: false,
    fullscreenButton: false,
    selectionIndicator: false,
    baseLayerPicker: true,
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
      rainSystem.setCondition(day.condition, day.rain / 100);
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
      rainSystem.setCondition(newLoc.days[0].condition, newLoc.days[0].rain / 100);
    }
  }
}

function animate() {
  const dt = 1 / animationState.fps;
  animationState.frame++;

  updateCamera(dt);
  rainSystem.update(dt);
  rainSystem.render();
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
  rainSystem.setCondition(firstDay.condition, firstDay.rain / 100);

  animate();
};

window.initCesium = initCesium;