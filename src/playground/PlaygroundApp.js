import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GPGPUParticleSystem } from '../core/GPGPUParticleSystem.js';
import { TextSampler, createTextSampler } from '../samplers/TextSampler.js';
import { PointerHandler } from '../interaction/PointerHandler.js';
import { CAMERA, COLORS, getCameraZForWidth, PARTICLES } from '../core/constants.js';
import { Presets, getPreset } from './presets.js';

/**
 * Main playground application
 * Sets up the Three.js scene and particle system
 */
export class PlaygroundApp {
  /**
   * @param {HTMLCanvasElement} canvas - Canvas element to render to
   * @param {Object} options - Application options
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.options = {
      fontUrl: './assets/font.json',
      colorTextureUrl: './assets/watermarble.jpg',
      initialPreset: 'text',
      ...options
    };

    // Three.js core
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;

    // Particle system
    this.particleSystem = null;
    this.currentSampler = null;

    // Interaction
    this.pointerHandler = null;
    this.raycasterPlane = null;

    // Resources
    this.font = null;
    this.colorTexture = null;

    // State
    this.isInitialized = false;
    this.isRunning = false;
    this._animationId = null;

    // Callbacks
    this._onReady = null;
    this._onParticleCountChange = null;
  }

  /**
   * Initialize the application
   * @returns {Promise<void>}
   */
  async init() {
    // Setup Three.js
    this._setupRenderer();
    this._setupScene();
    this._setupCamera();
    this._setupControls();
    this._setupLights();

    // Load resources
    await this._loadResources();

    // Setup particle system
    await this._setupParticleSystem();

    // Setup interaction
    this._setupInteraction();

    // Setup resize handler
    this._setupResizeHandler();

    this.isInitialized = true;

    if (this._onReady) {
      this._onReady();
    }
  }

  /**
   * Setup WebGL renderer
   * @private
   */
  _setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(COLORS.BACKGROUND);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  }

  /**
   * Setup scene
   * @private
   */
  _setupScene() {
    this.scene = new THREE.Scene();
  }

  /**
   * Setup camera
   * @private
   */
  _setupCamera() {
    this.camera = new THREE.PerspectiveCamera(
      CAMERA.FOV,
      window.innerWidth / window.innerHeight,
      CAMERA.NEAR,
      CAMERA.FAR
    );

    this.camera.position.z = getCameraZForWidth(window.innerWidth);
  }

  /**
   * Setup orbit controls
   * @private
   */
  _setupControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.touches = {
      TWO: THREE.TOUCH.DOLLY_ROTATE
    };
  }

  /**
   * Setup lights
   * @private
   */
  _setupLights() {
    const directionalLight = new THREE.DirectionalLight(COLORS.LIGHT_COLOR, 1);
    directionalLight.position.set(-1, 2, 3);
    
    const ambientLight = new THREE.AmbientLight(COLORS.LIGHT_COLOR, 1);
    
    this.scene.add(directionalLight);
    this.scene.add(ambientLight);
  }

  /**
   * Load required resources
   * @private
   */
  async _loadResources() {
    // Load font
    this.font = await TextSampler.loadFont(this.options.fontUrl);

    // Load color texture
    const textureLoader = new THREE.TextureLoader();
    this.colorTexture = await new Promise((resolve, reject) => {
      textureLoader.load(
        this.options.colorTextureUrl,
        (texture) => {
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          resolve(texture);
        },
        undefined,
        reject
      );
    });
  }

  /**
   * Setup particle system with initial preset
   * @private
   */
  async _setupParticleSystem() {
    const preset = getPreset(this.options.initialPreset);

    // Create particle system
    this.particleSystem = new GPGPUParticleSystem(this.renderer, {
      count: preset.particleCount,
      colorTexture: this.colorTexture,
      lod: { enabled: false }
    });

    // Create initial sampler
    this.currentSampler = new TextSampler(preset.text, this.font);
    await this.currentSampler.prepare();

    // Set source
    await this.particleSystem.setSource(this.currentSampler);

    // Add particles to scene
    if (this.particleSystem.particles) {
      this.particleSystem.particles.position.set(0, 0.5, 0);
      this.scene.add(this.particleSystem.particles);
    }
  }

  /**
   * Setup pointer interaction
   * @private
   */
  _setupInteraction() {
    this.pointerHandler = new PointerHandler(this.renderer.domElement, this.camera);

    // Create invisible plane for raycasting
    const planeGeometry = new THREE.PlaneGeometry(100, 100);
    const planeMaterial = new THREE.MeshBasicMaterial({
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false
    });
    this.raycasterPlane = new THREE.Mesh(planeGeometry, planeMaterial);
    this.raycasterPlane.position.set(0, 0, 0.5);
    this.raycasterPlane.visible = false;
    this.scene.add(this.raycasterPlane);
  }

  /**
   * Setup window resize handler
   * @private
   */
  _setupResizeHandler() {
    window.addEventListener('resize', () => this._onResize());
  }

  /**
   * Handle window resize
   * @private
   */
  _onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.camera.position.z = getCameraZForWidth(width);

    this.renderer.setSize(width, height);
  }

  /**
   * Start the render loop
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this._render();
  }

  /**
   * Stop the render loop
   */
  stop() {
    this.isRunning = false;
    if (this._animationId) {
      cancelAnimationFrame(this._animationId);
      this._animationId = null;
    }
  }

  /**
   * Main render loop
   * @private
   */
  _render() {
    if (!this.isRunning) return;

    this._animationId = requestAnimationFrame(() => this._render());

    // Update pointer
    this.pointerHandler.update(this.raycasterPlane, this.particleSystem.particles?.position);

    // Update particle system pointer
    this.particleSystem.setPointer(
      this.pointerHandler.getWorldPosition(),
      this.pointerHandler.getStartPosition()
    );

    // Update particle system
    this.particleSystem.update();

    // Update controls
    this.controls.update();

    // Render
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Update text
   * @param {string} text - New text
   * @param {boolean} smooth - Use smooth morphing
   */
  async updateText(text, smooth = true) {
    if (!this.font) return;

    const newSampler = new TextSampler(text, this.font);
    await newSampler.prepare();

    if (smooth) {
      await this.particleSystem.morphTo(newSampler);
    } else {
      await this.particleSystem.setSource(newSampler);
    }

    // Dispose old sampler
    if (this.currentSampler) {
      this.currentSampler.dispose();
    }
    this.currentSampler = newSampler;
  }

  /**
   * Update particle count
   * @param {number} count - New particle count
   */
  async updateParticleCount(count) {
    await this.particleSystem.setParticleCount(count);
    
    if (this._onParticleCountChange) {
      this._onParticleCountChange(this.particleSystem.getParticleCount());
    }
  }

  /**
   * Apply a preset
   * @param {string} presetName - Preset name
   */
  async applyPreset(presetName) {
    const preset = getPreset(presetName);
    
    await this.updateParticleCount(preset.particleCount);
    await this.updateText(preset.text, true);
  }

  /**
   * Get current particle count
   * @returns {number}
   */
  getParticleCount() {
    return this.particleSystem?.getParticleCount() ?? 0;
  }

  /**
   * Get max particle count
   * @returns {number}
   */
  getMaxParticleCount() {
    return PARTICLES.MAX_COUNT;
  }

  /**
   * Set ready callback
   * @param {Function} callback
   */
  onReady(callback) {
    this._onReady = callback;
    if (this.isInitialized) {
      callback();
    }
  }

  /**
   * Set particle count change callback
   * @param {Function} callback
   */
  onParticleCountChange(callback) {
    this._onParticleCountChange = callback;
  }

  /**
   * Clean up
   */
  dispose() {
    this.stop();

    if (this.particleSystem) {
      this.particleSystem.dispose();
    }

    if (this.currentSampler) {
      this.currentSampler.dispose();
    }

    if (this.pointerHandler) {
      this.pointerHandler.dispose();
    }

    if (this.controls) {
      this.controls.dispose();
    }

    if (this.renderer) {
      this.renderer.dispose();
    }

    if (this.colorTexture) {
      this.colorTexture.dispose();
    }
  }
}

