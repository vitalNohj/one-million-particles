import * as THREE from 'three';
import { RenderTargetPool } from './RenderTargetPool.js';
import { ShaderManager } from './ShaderManager.js';
import { LODController } from './LODController.js';
import { OP_CODES, PARTICLE_STATE } from './OperationCodes.js';
import { 
  PARTICLES, 
  PHYSICS, 
  COLORS,
  ParticleSystemState,
  calculateTextureDimensions 
} from './constants.js';
import { createPositionData, createVelocityData, createParticleAttributes } from '../utils/BufferUtils.js';
import * as TextureEncoder from '../utils/TextureEncoder.js';

/**
 * Self-Directing GPGPU Particle Engine
 * 
 * The GPU runs autonomously - shaders read operation codes from textures
 * and execute the appropriate math. CPU only interrupts to modify
 * operation codes or particle states in the textures.
 * 
 * Texture Format:
 * - Position Texture: RGB = position, A = operation code
 * - Velocity Texture: RGB = velocity, A = particle state
 */
export class GPGPUParticleSystem {
  /**
   * @param {THREE.WebGLRenderer} renderer - WebGL renderer
   * @param {Object} options - Configuration options
   * @param {number} options.count - Initial particle count
   * @param {Object} options.lod - LOD configuration
   * @param {THREE.Texture} options.colorTexture - Texture for particle coloring
   * @param {boolean} options.usePipeline - Use self-directing pipeline shaders (default: true)
   */
  constructor(renderer, options = {}) {
    this.renderer = renderer;
    this.options = {
      count: PARTICLES.DEFAULT_COUNT,
      lod: { enabled: false },
      colorTexture: null,
      usePipeline: true,  // Use self-directing pipeline by default
      ...options
    };

    // State management
    this.state = ParticleSystemState.IDLE;
    this._currentCount = this.options.count;
    this._interrupted = false;
    this._frameCount = 0;
    
    // Calculate initial texture dimensions
    const dims = calculateTextureDimensions(this._currentCount);
    this._textureWidth = dims.width;
    this._textureHeight = dims.height;
    this._actualCount = this._textureWidth * this._textureHeight;

    // Core components
    this.renderTargetPool = new RenderTargetPool(renderer);
    this.shaderManager = new ShaderManager();
    this.lodController = new LODController(this.options.lod);

    // Three.js objects
    this._fboScene = new THREE.Scene();
    this._fboCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    
    // Current sampler
    this._sampler = null;
    
    // Particle Points object (for adding to scene)
    this.particles = null;
    
    // Data textures
    this._originalPositionsTexture = null;
    this._positionsTexture = null;
    this._velocitiesTexture = null;
    
    // Dedicated metadata textures (separate from position/velocity)
    this._operationCodesTexture = null;  // Operation code per particle
    this._particleStatesTexture = null;  // Particle lifecycle state per particle

    // CPU-side texture data cache for modifications
    this._positionDataCache = null;
    this._velocityDataCache = null;

    // Operation queue texture
    this._operationQueueTexture = null;
    this._operationQueue = [];  // Current queue of operations

    // Time tracking
    this._clock = new THREE.Clock();
    this._time = 0;

    // Initialize
    this._initFBOMesh();
    this._initMaterials();
    
    // Setup LOD callback
    this.lodController.onCountChange((newCount) => {
      this.setParticleCount(newCount);
    });
  }

  /**
   * Initialize the fullscreen quad mesh for compute passes
   * @private
   */
  _initFBOMesh() {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array([
      -1, -1, 0,
       1, -1, 0,
       1,  1, 0,
      -1, -1, 0,
       1,  1, 0,
      -1,  1, 0
    ]);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    // Will swap materials for different compute passes
    this._fboMesh = new THREE.Mesh(geometry, null);
    this._fboScene.add(this._fboMesh);
  }

  /**
   * Initialize shader materials
   * @private
   */
  _initMaterials() {
    // Legacy separate shaders
    this._positionMaterial = this.shaderManager.createPositionMaterial();
    this._velocityMaterial = this.shaderManager.createVelocityMaterial();
    
    // Self-directing pipeline shaders
    this._pipelineMaterial = this.shaderManager.createPipelineMaterial();
    this._velocityPipelineMaterial = this.shaderManager.createVelocityPipelineMaterial();
    
    // Particle rendering
    this._particleMaterial = this.shaderManager.createParticleMaterial(this.options.colorTexture);
  }

  /**
   * Set the geometry source for particles
   * @param {BaseSampler} sampler - Geometry sampler
   * @returns {Promise<void>}
   */
  async setSource(sampler) {
    if (this.state !== ParticleSystemState.IDLE) {
      console.warn('GPGPUParticleSystem: Cannot set source while updating');
      return;
    }

    this.state = ParticleSystemState.INITIALIZING;
    this._sampler = sampler;

    // Ensure sampler is ready
    if (!sampler.isReady) {
      await sampler.prepare();
    }

    // Generate particle data
    await this._generateParticleData();

    // Initialize render targets
    this._initRenderTargets();

    // Create particle Points object
    this._createParticlePoints();

    this.state = ParticleSystemState.IDLE;
  }

  /**
   * Generate particle position and velocity data
   * @private
   */
  async _generateParticleData() {
    // Sample positions from geometry
    const positionData = this._sampler.sample(this._actualCount);
    
    // Note: Position data alpha is now unused (we use dedicated operation codes texture)
    // But we'll keep it at 0 for now to maintain compatibility
    
    // Cache UVs for particle point creation
    if (this._sampler.getUVs) {
      this._cachedUVs = this._sampler.getUVs(this._actualCount, positionData);
    }

    // Velocity data - alpha is now unused (we use dedicated particle states texture)
    const velocityData = createVelocityData(this._actualCount, 0); // Alpha unused

    // Dispose old textures
    this._disposeDataTextures();

    // Create data textures
    this._originalPositionsTexture = new THREE.DataTexture(
      new Float32Array(positionData),
      this._textureWidth,
      this._textureHeight,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    this._originalPositionsTexture.minFilter = THREE.NearestFilter;
    this._originalPositionsTexture.magFilter = THREE.NearestFilter;
    this._originalPositionsTexture.needsUpdate = true;

    this._positionsTexture = new THREE.DataTexture(
      new Float32Array(positionData),
      this._textureWidth,
      this._textureHeight,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    this._positionsTexture.minFilter = THREE.NearestFilter;
    this._positionsTexture.magFilter = THREE.NearestFilter;
    this._positionsTexture.needsUpdate = true;

    this._velocitiesTexture = new THREE.DataTexture(
      velocityData,
      this._textureWidth,
      this._textureHeight,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    this._velocitiesTexture.minFilter = THREE.NearestFilter;
    this._velocitiesTexture.magFilter = THREE.NearestFilter;
    this._velocitiesTexture.needsUpdate = true;

    // Create dedicated operation codes texture (R = op code, GBA = reserved)
    const operationCodesData = new Float32Array(this._actualCount * 4);
    for (let i = 0; i < this._actualCount; i++) {
      operationCodesData[i * 4 + 0] = OP_CODES.ALL; // Operation code in R channel
      operationCodesData[i * 4 + 1] = 0; // Reserved
      operationCodesData[i * 4 + 2] = 0; // Reserved
      operationCodesData[i * 4 + 3] = 0; // Reserved
    }
    this._operationCodesTexture = new THREE.DataTexture(
      operationCodesData,
      this._textureWidth,
      this._textureHeight,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    this._operationCodesTexture.minFilter = THREE.NearestFilter;
    this._operationCodesTexture.magFilter = THREE.NearestFilter;
    this._operationCodesTexture.needsUpdate = true;

    // Create dedicated particle states texture (R = state, GBA = reserved)
    const particleStatesData = new Float32Array(this._actualCount * 4);
    for (let i = 0; i < this._actualCount; i++) {
      particleStatesData[i * 4 + 0] = PARTICLE_STATE.ACTIVE; // State in R channel
      particleStatesData[i * 4 + 1] = 0; // Reserved
      particleStatesData[i * 4 + 2] = 0; // Reserved
      particleStatesData[i * 4 + 3] = 0; // Reserved
    }
    this._particleStatesTexture = new THREE.DataTexture(
      particleStatesData,
      this._textureWidth,
      this._textureHeight,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    this._particleStatesTexture.minFilter = THREE.NearestFilter;
    this._particleStatesTexture.magFilter = THREE.NearestFilter;
    this._particleStatesTexture.needsUpdate = true;

    // Update shader uniforms
    this._updateMaterialUniforms();
  }

  /**
   * Update material uniforms with current textures
   * @private
   */
  _updateMaterialUniforms() {
    const resolution = new THREE.Vector2(this._textureWidth, this._textureHeight);

    // Legacy position material
    this._positionMaterial.uniforms.uOriginalPositionsTexture.value = this._originalPositionsTexture;
    this._positionMaterial.uniforms.uPositionsTexture.value = this._positionsTexture;
    this._positionMaterial.uniforms.uVelocitiesTexture.value = this._velocitiesTexture;
    this._positionMaterial.uniforms.uTextureResolution.value = resolution;
    this._positionMaterial.uniforms.uNoiseFrequency.value = PHYSICS.NOISE_FREQUENCY;
    this._positionMaterial.uniforms.uNoiseAmplitude.value = PHYSICS.NOISE_AMPLITUDE;

    // Legacy velocity material
    this._velocityMaterial.uniforms.uOriginalPositionsTexture.value = this._originalPositionsTexture;
    this._velocityMaterial.uniforms.uPositionsTexture.value = this._positionsTexture;
    this._velocityMaterial.uniforms.uVelocitiesTexture.value = this._velocitiesTexture;
    this._velocityMaterial.uniforms.uTextureResolution.value = resolution;

    // Pipeline position material
    this._pipelineMaterial.uniforms.uOriginalPositionsTexture.value = this._originalPositionsTexture;
    this._pipelineMaterial.uniforms.uPositionsTexture.value = this._positionsTexture;
    this._pipelineMaterial.uniforms.uVelocitiesTexture.value = this._velocitiesTexture;
    this._pipelineMaterial.uniforms.uOperationCodesTexture = { value: this._operationCodesTexture };
    this._pipelineMaterial.uniforms.uParticleStatesTexture = { value: this._particleStatesTexture };
    this._pipelineMaterial.uniforms.uTextureResolution.value = resolution;
    this._pipelineMaterial.uniforms.uNoiseFrequency.value = PHYSICS.NOISE_FREQUENCY;
    this._pipelineMaterial.uniforms.uNoiseAmplitude.value = PHYSICS.NOISE_AMPLITUDE;
    this._pipelineMaterial.uniforms.uPointerRadius.value = PHYSICS.POINTER_INFLUENCE_RADIUS;

    // Pipeline velocity material
    this._velocityPipelineMaterial.uniforms.uOriginalPositionsTexture.value = this._originalPositionsTexture;
    this._velocityPipelineMaterial.uniforms.uPositionsTexture.value = this._positionsTexture;
    this._velocityPipelineMaterial.uniforms.uVelocitiesTexture.value = this._velocitiesTexture;
    this._velocityPipelineMaterial.uniforms.uOperationCodesTexture = { value: this._operationCodesTexture };
    this._velocityPipelineMaterial.uniforms.uParticleStatesTexture = { value: this._particleStatesTexture };
    this._velocityPipelineMaterial.uniforms.uTextureResolution.value = resolution;
    this._velocityPipelineMaterial.uniforms.uNoiseFrequency.value = PHYSICS.NOISE_FREQUENCY;
    this._velocityPipelineMaterial.uniforms.uNoiseAmplitude.value = PHYSICS.NOISE_AMPLITUDE;
    this._velocityPipelineMaterial.uniforms.uPointerRadius.value = PHYSICS.POINTER_INFLUENCE_RADIUS;
  }

  /**
   * Initialize ping-pong render targets
   * @private
   */
  _initRenderTargets() {
    this.renderTargetPool.createPingPongTargets('position', this._textureWidth, this._textureHeight);
    this.renderTargetPool.createPingPongTargets('velocity', this._textureWidth, this._textureHeight);
    this.renderTargetPool.createPingPongTargets('operationCodes', this._textureWidth, this._textureHeight);
    this.renderTargetPool.createPingPongTargets('particleStates', this._textureWidth, this._textureHeight);

    // Initialize with data texture content
    this._initializeRenderTargetContent();
  }

  /**
   * Copy data texture content to render targets
   * @private
   */
  _initializeRenderTargetContent() {
    const copyMaterial = this.shaderManager.createCopyMaterial();
    const resolution = new THREE.Vector2(this._textureWidth, this._textureHeight);
    copyMaterial.uniforms.uTextureResolution.value = resolution;

    // Render position data to position target
    this._fboMesh.material = this._positionMaterial;
    const posWriteTarget = this.renderTargetPool.getWriteTarget('position');
    this.renderer.setRenderTarget(posWriteTarget);
    this.renderer.clear();
    this.renderer.render(this._fboScene, this._fboCamera);
    this.renderTargetPool.swap('position');

    // Render velocity data to velocity target  
    this._fboMesh.material = this._velocityMaterial;
    const velWriteTarget = this.renderTargetPool.getWriteTarget('velocity');
    this.renderer.setRenderTarget(velWriteTarget);
    this.renderer.clear();
    this.renderer.render(this._fboScene, this._fboCamera);
    this.renderTargetPool.swap('velocity');

    // Copy operation codes data texture to render target
    copyMaterial.uniforms.uInputTexture.value = this._operationCodesTexture;
    this._fboMesh.material = copyMaterial;
    const opCodesWriteTarget = this.renderTargetPool.getWriteTarget('operationCodes');
    this.renderer.setRenderTarget(opCodesWriteTarget);
    this.renderer.clear();
    this.renderer.render(this._fboScene, this._fboCamera);
    this.renderTargetPool.swap('operationCodes');

    // Copy particle states data texture to render target
    copyMaterial.uniforms.uInputTexture.value = this._particleStatesTexture;
    const statesWriteTarget = this.renderTargetPool.getWriteTarget('particleStates');
    this.renderer.setRenderTarget(statesWriteTarget);
    this.renderer.clear();
    this.renderer.render(this._fboScene, this._fboCamera);
    this.renderTargetPool.swap('particleStates');

    this.renderer.setRenderTarget(null);

    const posReadTexture = this.renderTargetPool.getReadTarget('position').texture;
    const velReadTexture = this.renderTargetPool.getReadTarget('velocity').texture;
    const opCodesReadTexture = this.renderTargetPool.getReadTarget('operationCodes').texture;
    const statesReadTexture = this.renderTargetPool.getReadTarget('particleStates').texture;

    // Update legacy material uniforms to use render target textures
    this._positionMaterial.uniforms.uPositionsTexture.value = posReadTexture;
    this._positionMaterial.uniforms.uVelocitiesTexture.value = velReadTexture;
    this._velocityMaterial.uniforms.uPositionsTexture.value = posReadTexture;
    this._velocityMaterial.uniforms.uVelocitiesTexture.value = velReadTexture;

    // Update pipeline material uniforms to use render target textures
    this._pipelineMaterial.uniforms.uPositionsTexture.value = posReadTexture;
    this._pipelineMaterial.uniforms.uVelocitiesTexture.value = velReadTexture;
    this._pipelineMaterial.uniforms.uOperationCodesTexture.value = opCodesReadTexture;
    this._pipelineMaterial.uniforms.uParticleStatesTexture.value = statesReadTexture;
    this._velocityPipelineMaterial.uniforms.uPositionsTexture.value = posReadTexture;
    this._velocityPipelineMaterial.uniforms.uVelocitiesTexture.value = velReadTexture;
    this._velocityPipelineMaterial.uniforms.uOperationCodesTexture.value = opCodesReadTexture;
    this._velocityPipelineMaterial.uniforms.uParticleStatesTexture.value = statesReadTexture;
  }

  /**
   * Create the particle Points object for rendering
   * @private
   */
  _createParticlePoints() {
    // Dispose old geometry if exists
    if (this.particles?.geometry) {
      this.particles.geometry.dispose();
    }

    // Create particle geometry
    const geometry = new THREE.BufferGeometry();
    const { positions, uvs } = createParticleAttributes(
      this._actualCount,
      this._textureWidth,
      this._textureHeight,
      (i) => {
        // Get UVs from cached sampler data
        if (this._cachedUVs) {
          return [
            this._cachedUVs[i * 2],
            this._cachedUVs[i * 2 + 1]
          ];
        }
        return [0, 0];
      }
    );

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

    // Set a large bounding sphere to prevent culling
    geometry.computeBoundingSphere();
    geometry.boundingSphere.radius = 1000;

    // Create or update Points object
    if (!this.particles) {
      this.particles = new THREE.Points(geometry, this._particleMaterial);
      this.particles.frustumCulled = false;
    } else {
      this.particles.geometry = geometry;
    }

    // Update particle material uniforms
    if (this._particleMaterial.uniforms) {
      this._particleMaterial.uniforms.uPositionsTexture.value = 
        this.renderTargetPool.getReadTarget('position').texture;
      this._particleMaterial.uniforms.uOriginalPositionsTexture.value = 
        this._originalPositionsTexture;
    }

    // Clear cached UVs
    this._cachedUVs = null;
  }

  /**
   * Morph particles to a new geometry source
   * @param {BaseSampler} newSampler - New geometry sampler
   * @param {Object} options - Morph options
   * @param {number} options.duration - Morph duration in seconds
   * @returns {Promise<void>}
   */
  async morphTo(newSampler, options = {}) {
    if (this.state !== ParticleSystemState.IDLE) {
      console.warn('GPGPUParticleSystem: Cannot morph while updating');
      return;
    }

    this.state = ParticleSystemState.MORPHING;

    // Ensure new sampler is ready
    if (!newSampler.isReady) {
      await newSampler.prepare();
    }

    // Sample new positions
    const newPositionData = newSampler.sample(this._actualCount);

    // Dispose old original positions texture
    if (this._originalPositionsTexture) {
      this._originalPositionsTexture.dispose();
    }

    // Create new original positions texture (particles will animate to these)
    this._originalPositionsTexture = new THREE.DataTexture(
      new Float32Array(newPositionData),
      this._textureWidth,
      this._textureHeight,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    this._originalPositionsTexture.minFilter = THREE.NearestFilter;
    this._originalPositionsTexture.magFilter = THREE.NearestFilter;
    this._originalPositionsTexture.needsUpdate = true;

    // Update uniforms
    this._positionMaterial.uniforms.uOriginalPositionsTexture.value = this._originalPositionsTexture;
    this._velocityMaterial.uniforms.uOriginalPositionsTexture.value = this._originalPositionsTexture;
    this._pipelineMaterial.uniforms.uOriginalPositionsTexture.value = this._originalPositionsTexture;
    this._velocityPipelineMaterial.uniforms.uOriginalPositionsTexture.value = this._originalPositionsTexture;

    // Update sampler reference
    this._sampler = newSampler;

    this.state = ParticleSystemState.IDLE;
  }

  /**
   * Set particle count (regenerates particle system)
   * @param {number} count - New particle count
   * @returns {Promise<void>}
   */
  async setParticleCount(count) {
    if (this.state !== ParticleSystemState.IDLE) {
      console.warn('GPGPUParticleSystem: Cannot change count while updating');
      return;
    }

    count = Math.max(PARTICLES.MIN_COUNT, Math.min(PARTICLES.MAX_COUNT, count));
    if (count === this._currentCount) return;

    this.state = ParticleSystemState.UPDATING_COUNT;
    this._currentCount = count;

    // Recalculate dimensions
    const dims = calculateTextureDimensions(count);
    this._textureWidth = dims.width;
    this._textureHeight = dims.height;
    this._actualCount = this._textureWidth * this._textureHeight;

    // Dispose old render targets
    this.renderTargetPool.dispose('position');
    this.renderTargetPool.dispose('velocity');
    this.renderTargetPool.dispose('operationCodes');
    this.renderTargetPool.dispose('particleStates');

    // Regenerate everything
    if (this._sampler) {
      await this._generateParticleData();
      this._initRenderTargets();
      this._createParticlePoints();
    }

    this.state = ParticleSystemState.IDLE;
  }

  /**
   * Update pointer position for interaction
   * @param {THREE.Vector3} position - Pointer world position
   * @param {THREE.Vector3} startPosition - Pointer start position
   */
  setPointer(position, startPosition) {
    // Legacy materials
    this._positionMaterial.uniforms.uPointer.value.copy(position);
    this._positionMaterial.uniforms.uPointerStart.value.copy(startPosition);
    this._velocityMaterial.uniforms.uPointer.value.copy(position);
    this._velocityMaterial.uniforms.uPointerStart.value.copy(startPosition);
    
    // Pipeline materials
    this._pipelineMaterial.uniforms.uPointer.value.copy(position);
    this._pipelineMaterial.uniforms.uPointerStart.value.copy(startPosition);
    this._velocityPipelineMaterial.uniforms.uPointer.value.copy(position);
    this._velocityPipelineMaterial.uniforms.uPointerStart.value.copy(startPosition);
  }

  /**
   * Update the particle system (call every frame)
   * 
   * In pipeline mode, the shader reads operation codes from the texture
   * and executes the appropriate math autonomously. The CPU only needs
   * to trigger the render - the shader decides what calculations to run.
   * 
   * @param {number} deltaTime - Time since last frame (optional, uses internal clock if not provided)
   */
  update(deltaTime) {
    // Check for CPU interrupt
    if (this._interrupted) {
      return;
    }

    if (!this.renderTargetPool.has('position') || !this.renderTargetPool.has('velocity')) {
      return;
    }

    // Use provided deltaTime or get from clock
    const dt = deltaTime ?? this._clock.getDelta();
    this._time += dt;
    this._frameCount++;

    // Record frame for LOD
    this.lodController.recordFrame(dt);

    // Choose which materials to use
    const usePipeline = this.options.usePipeline;
    const posMaterial = usePipeline ? this._pipelineMaterial : this._positionMaterial;
    const velMaterial = usePipeline ? this._velocityPipelineMaterial : this._velocityMaterial;

    // Update time uniforms
    posMaterial.uniforms.uTime.value = this._time;
    posMaterial.uniforms.uDeltaTime.value = dt;
    velMaterial.uniforms.uTime.value = this._time;
    velMaterial.uniforms.uDeltaTime.value = dt;

    // Velocity pass - shader reads operation code from texture and executes appropriate math
    this._fboMesh.material = velMaterial;
    const velWriteTarget = this.renderTargetPool.getWriteTarget('velocity');
    this.renderer.setRenderTarget(velWriteTarget);
    this.renderer.clear();
    this.renderer.render(this._fboScene, this._fboCamera);
    this.renderTargetPool.swap('velocity');
    
    // Update velocity texture reference
    const velReadTarget = this.renderTargetPool.getReadTarget('velocity');
    posMaterial.uniforms.uVelocitiesTexture.value = velReadTarget.texture;
    velMaterial.uniforms.uVelocitiesTexture.value = velReadTarget.texture;
    // Also update legacy materials for compatibility
    this._positionMaterial.uniforms.uVelocitiesTexture.value = velReadTarget.texture;
    this._velocityMaterial.uniforms.uVelocitiesTexture.value = velReadTarget.texture;

    // Position pass - shader reads operation code from texture and executes appropriate math
    this._fboMesh.material = posMaterial;
    const posWriteTarget = this.renderTargetPool.getWriteTarget('position');
    this.renderer.setRenderTarget(posWriteTarget);
    this.renderer.clear();
    this.renderer.render(this._fboScene, this._fboCamera);
    this.renderTargetPool.swap('position');

    // Update position texture reference
    const posReadTarget = this.renderTargetPool.getReadTarget('position');
    posMaterial.uniforms.uPositionsTexture.value = posReadTarget.texture;
    velMaterial.uniforms.uPositionsTexture.value = posReadTarget.texture;
    // Also update legacy materials for compatibility
    this._positionMaterial.uniforms.uPositionsTexture.value = posReadTarget.texture;
    this._velocityMaterial.uniforms.uPositionsTexture.value = posReadTarget.texture;

    // Update operation codes and particle states texture references (read-only from GPU)
    // These are only updated by CPU via interrupt, so we use the render target textures
    if (usePipeline) {
      const opCodesReadTarget = this.renderTargetPool.getReadTarget('operationCodes');
      const statesReadTarget = this.renderTargetPool.getReadTarget('particleStates');
      this._pipelineMaterial.uniforms.uOperationCodesTexture.value = opCodesReadTarget.texture;
      this._pipelineMaterial.uniforms.uParticleStatesTexture.value = statesReadTarget.texture;
      this._velocityPipelineMaterial.uniforms.uOperationCodesTexture.value = opCodesReadTarget.texture;
      this._velocityPipelineMaterial.uniforms.uParticleStatesTexture.value = statesReadTarget.texture;
    }

    // Update particle material
    if (this._particleMaterial.uniforms) {
      this._particleMaterial.uniforms.uPositionsTexture.value = posReadTarget.texture;
      // Original positions texture doesn't change during update, but ensure it's set
      if (!this._particleMaterial.uniforms.uOriginalPositionsTexture.value) {
        this._particleMaterial.uniforms.uOriginalPositionsTexture.value = this._originalPositionsTexture;
      }
    }

    this.renderer.setRenderTarget(null);
  }

  /**
   * Update LOD system
   * @param {number} cameraDistance - Distance from camera to particles
   */
  updateLOD(cameraDistance = null) {
    this.lodController.update(performance.now(), cameraDistance);
  }

  /**
   * Get current particle count
   * @returns {number}
   */
  getParticleCount() {
    return this._actualCount;
  }

  /**
   * Get current state
   * @returns {string}
   */
  getState() {
    return this.state;
  }

  /**
   * Dispose data textures
   * @private
   */
  _disposeDataTextures() {
    if (this._originalPositionsTexture) {
      this._originalPositionsTexture.dispose();
      this._originalPositionsTexture = null;
    }
    if (this._positionsTexture) {
      this._positionsTexture.dispose();
      this._positionsTexture = null;
    }
    if (this._velocitiesTexture) {
      this._velocitiesTexture.dispose();
      this._velocitiesTexture = null;
    }
    if (this._operationCodesTexture) {
      this._operationCodesTexture.dispose();
      this._operationCodesTexture = null;
    }
    if (this._particleStatesTexture) {
      this._particleStatesTexture.dispose();
      this._particleStatesTexture = null;
    }
  }

  /**
   * Set particle point size
   * @param {number} size - Point size
   */
  setPointSize(size) {
    if (this._particleMaterial?.uniforms) {
      this._particleMaterial.uniforms.uPointSize.value = size;
    }
  }

  /**
   * Set particle opacity
   * @param {number} opacity - Opacity (0.0 to 1.0)
   */
  setOpacity(opacity) {
    if (this._particleMaterial?.uniforms) {
      this._particleMaterial.uniforms.uOpacity.value = opacity;
    }
  }

  /**
   * Set highlight color
   * @param {number} r - Red (0-1)
   * @param {number} g - Green (0-1)
   * @param {number} b - Blue (0-1)
   */
  setHighlightColor(r, g, b) {
    if (this._particleMaterial?.uniforms) {
      this._particleMaterial.uniforms.uHighlightColor.value.setRGB(r, g, b);
    }
  }

  /**
   * Set noise parameters
   * @param {number} [frequency] - Noise frequency
   * @param {number} [amplitude] - Noise amplitude
   */
  setNoiseParams(frequency, amplitude) {
    if (this._positionMaterial?.uniforms) {
      if (frequency !== undefined) this._positionMaterial.uniforms.uNoiseFrequency.value = frequency;
      if (amplitude !== undefined) this._positionMaterial.uniforms.uNoiseAmplitude.value = amplitude;
    }
    if (this._pipelineMaterial?.uniforms) {
      if (frequency !== undefined) this._pipelineMaterial.uniforms.uNoiseFrequency.value = frequency;
      if (amplitude !== undefined) this._pipelineMaterial.uniforms.uNoiseAmplitude.value = amplitude;
    }
    if (this._velocityPipelineMaterial?.uniforms) {
      if (frequency !== undefined) this._velocityPipelineMaterial.uniforms.uNoiseFrequency.value = frequency;
      if (amplitude !== undefined) this._velocityPipelineMaterial.uniforms.uNoiseAmplitude.value = amplitude;
    }
  }

  // ============================================================
  // SELF-DIRECTING PIPELINE API
  // ============================================================

  /**
   * Set global operation for all particles
   * This overrides per-particle operation codes stored in the texture.
   * Set to 0 to use per-particle operations from texture.
   * @param {number} opCode - Operation code from OP_CODES
   */
  setGlobalOperation(opCode) {
    this.shaderManager.setGlobalOperation(opCode);
  }

  /**
   * Set operation parameters for the pipeline shaders
   * @param {Object} params - Operation parameters
   * @param {number[]} [params.gravity] - Gravity vector [x, y, z]
   * @param {number[]} [params.windDirection] - Wind direction [x, y, z]
   * @param {number} [params.windStrength] - Wind strength
   * @param {number} [params.noiseFrequency] - Noise frequency
   * @param {number} [params.noiseAmplitude] - Noise amplitude
   * @param {number[]} [params.attractorPosition] - Attractor position [x, y, z]
   * @param {number} [params.attractorStrength] - Attractor strength (negative = repel)
   * @param {number} [params.attractorRadius] - Attractor influence radius
   * @param {number} [params.returnHomeStrength] - Spring back strength
   * @param {number} [params.damping] - Velocity damping (0-1)
   * @param {number} [params.maxSpeed] - Maximum particle speed
   * @param {number} [params.maxDistanceFromCenter] - Max distance before kill
   * @param {boolean} [params.distanceKillEnabled] - Enable distance-based kill
   * @param {number} [params.centerPullStrength] - Center pull force strength
   * @param {number[]} [params.centerPullTarget] - Center pull target [x, y, z]
   */
  setOperationParams(params) {
    this.shaderManager.setOperationParams(params);
  }

  // ============================================================
  // DISTANCE TRACKING AND KILL API
  // ============================================================

  /**
   * Set maximum distance from center before particles are killed
   * @param {number} distance - Maximum distance (particles beyond this are killed)
   */
  setMaxDistance(distance) {
    this.shaderManager.setDistanceKill(distance);
  }

  /**
   * Enable or disable distance-based particle kill
   * @param {boolean} enabled - Whether to kill particles that exceed max distance
   */
  setDistanceKillEnabled(enabled) {
    this.shaderManager.updatePipelineUniforms({
      uDistanceKillEnabled: enabled ? 1.0 : 0.0
    });
  }

  /**
   * Set center pull strength
   * @param {number} strength - Strength of the center pull force
   */
  setCenterPullStrength(strength) {
    this.shaderManager.setCenterPull(strength);
  }

  /**
   * Set center pull target position
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {number} z - Z coordinate
   */
  setCenterPullTarget(x, y, z) {
    this.shaderManager.setCenterPull(undefined, [x, y, z]);
  }

  /**
   * Get particle distances from center
   * Reads the distance data from the position texture's alpha channel
   * @returns {Promise<Float32Array>} Array of distances (one per particle)
   */
  async getParticleDistances() {
    const positionData = await this.readParticlePositions();
    const distances = new Float32Array(this._actualCount);
    
    for (let i = 0; i < this._actualCount; i++) {
      // Distance is stored in alpha channel of position texture
      distances[i] = positionData[i * 4 + 3];
    }
    
    return distances;
  }

  /**
   * Get indices of particles that exceed the given distance threshold
   * @param {number} threshold - Distance threshold
   * @returns {Promise<number[]>} Array of particle indices exceeding threshold
   */
  async getParticlesBeyondDistance(threshold) {
    const distances = await this.getParticleDistances();
    const indices = [];
    
    for (let i = 0; i < distances.length; i++) {
      if (distances[i] > threshold) {
        indices.push(i);
      }
    }
    
    return indices;
  }

  /**
   * Get statistics about particle distances
   * @returns {Promise<{min: number, max: number, avg: number, count: number}>}
   */
  async getDistanceStats() {
    const distances = await this.getParticleDistances();
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let count = 0;
    
    for (const dist of distances) {
      if (dist > 0) { // Skip dead particles at origin
        min = Math.min(min, dist);
        max = Math.max(max, dist);
        sum += dist;
        count++;
      }
    }
    
    return {
      min: count > 0 ? min : 0,
      max: count > 0 ? max : 0,
      avg: count > 0 ? sum / count : 0,
      count
    };
  }

  // ============================================================
  // INTERRUPT SYSTEM
  // ============================================================

  /**
   * Interrupt the GPU loop for CPU modifications
   * While interrupted, update() will return immediately.
   */
  interrupt() {
    this._interrupted = true;
  }

  /**
   * Resume the GPU loop after CPU modifications
   */
  resume() {
    this._interrupted = false;
  }

  /**
   * Check if the system is currently interrupted
   * @returns {boolean}
   */
  isInterrupted() {
    return this._interrupted;
  }

  // ============================================================
  // TEXTURE MODIFICATION API
  // ============================================================

  /**
   * Read current particle positions from GPU texture
   * @returns {Promise<Float32Array>} RGBA position data
   */
  async readParticlePositions() {
    const posTarget = this.renderTargetPool.getReadTarget('position');
    return TextureEncoder.readRenderTargetPixels(this.renderer, posTarget);
  }

  /**
   * Read current particle velocities from GPU texture
   * @returns {Promise<Float32Array>} RGBA velocity data
   */
  async readParticleVelocities() {
    const velTarget = this.renderTargetPool.getReadTarget('velocity');
    return TextureEncoder.readRenderTargetPixels(this.renderer, velTarget);
  }

  /**
   * Read current operation codes from GPU texture
   * @returns {Promise<Float32Array>} RGBA operation codes data
   */
  async readOperationCodes() {
    const opCodesTarget = this.renderTargetPool.getReadTarget('operationCodes');
    return TextureEncoder.readRenderTargetPixels(this.renderer, opCodesTarget);
  }

  /**
   * Read current particle states from GPU texture
   * @returns {Promise<Float32Array>} RGBA particle states data
   */
  async readParticleStates() {
    const statesTarget = this.renderTargetPool.getReadTarget('particleStates');
    return TextureEncoder.readRenderTargetPixels(this.renderer, statesTarget);
  }

  /**
   * Set operation code for specific particles
   * Requires interrupt() to be called first.
   * @param {number[]} indices - Particle indices to modify
   * @param {number} opCode - Operation code from OP_CODES
   */
  async setParticleOperations(indices, opCode) {
    if (!this._interrupted) {
      console.warn('GPGPUParticleSystem: Call interrupt() before modifying particle operations');
      return;
    }

    // Read current operation codes data
    const opCodesData = await this.readOperationCodes();
    
    // Modify operation codes (stored in R channel)
    for (const index of indices) {
      const i4 = index * 4;
      if (i4 < opCodesData.length) {
        opCodesData[i4 + 0] = opCode; // R channel = operation code
      }
    }
    
    // Write back to texture
    await this._writeOperationCodesData(opCodesData);
  }

  /**
   * Set operation code for all particles via texture modification
   * Requires interrupt() to be called first.
   * @param {number} opCode - Operation code from OP_CODES
   */
  async setAllParticleOperations(opCode) {
    if (!this._interrupted) {
      console.warn('GPGPUParticleSystem: Call interrupt() before modifying particle operations');
      return;
    }

    // Read current operation codes data
    const opCodesData = await this.readOperationCodes();
    
    // Set all operation codes (stored in R channel)
    for (let i = 0; i < this._actualCount; i++) {
      opCodesData[i * 4 + 0] = opCode;
    }
    
    // Write back to texture
    await this._writeOperationCodesData(opCodesData);
  }

  // ============================================================
  // PARTICLE LIFECYCLE
  // ============================================================

  /**
   * Spawn particles at specific indices
   * Sets their state to SPAWNING so the shader will initialize them.
   * @param {number[]} indices - Particle indices to spawn
   */
  async spawnParticles(indices) {
    if (!this._interrupted) {
      console.warn('GPGPUParticleSystem: Call interrupt() before spawning particles');
      return;
    }

    const statesData = await this.readParticleStates();
    // Set state to SPAWNING (stored in R channel)
    for (const index of indices) {
      const i4 = index * 4;
      if (i4 < statesData.length) {
        statesData[i4 + 0] = PARTICLE_STATE.SPAWNING;
      }
    }
    await this._writeParticleStatesData(statesData);
  }

  /**
   * Kill particles at specific indices
   * Sets their state to DEAD so the shader will skip them.
   * @param {number[]} indices - Particle indices to kill
   */
  async killParticles(indices) {
    if (!this._interrupted) {
      console.warn('GPGPUParticleSystem: Call interrupt() before killing particles');
      return;
    }

    const statesData = await this.readParticleStates();
    // Set state to DEAD (stored in R channel)
    for (const index of indices) {
      const i4 = index * 4;
      if (i4 < statesData.length) {
        statesData[i4 + 0] = PARTICLE_STATE.DEAD;
      }
    }
    await this._writeParticleStatesData(statesData);
  }

  /**
   * Get indices of all dead particles
   * @returns {Promise<number[]>} Array of dead particle indices
   */
  async getDeadParticles() {
    const statesData = await this.readParticleStates();
    const indices = [];
    for (let i = 0; i < this._actualCount; i++) {
      if (statesData[i * 4 + 0] === PARTICLE_STATE.DEAD) {
        indices.push(i);
      }
    }
    return indices;
  }

  /**
   * Get indices of all active particles
   * @returns {Promise<number[]>} Array of active particle indices
   */
  async getActiveParticles() {
    const statesData = await this.readParticleStates();
    const indices = [];
    for (let i = 0; i < this._actualCount; i++) {
      if (statesData[i * 4 + 0] === PARTICLE_STATE.ACTIVE) {
        indices.push(i);
      }
    }
    return indices;
  }

  // ============================================================
  // OPERATION QUEUE
  // ============================================================

  /**
   * Queue operations for sequential execution
   * Particles will cycle through these operations in order.
   * @param {number[]} opCodes - Array of operation codes (max 3)
   */
  queueOperations(opCodes) {
    this._operationQueue = opCodes.slice(0, 3); // Max 3 operations in queue
    
    // Create or update operation queue texture
    if (!this._operationQueueTexture) {
      this._operationQueueTexture = TextureEncoder.createOperationQueueTexture(
        this._actualCount,
        this._textureWidth,
        this._textureHeight,
        this._operationQueue
      );
    } else {
      // Update existing texture with new queue
      const data = new Float32Array(this._actualCount * 4);
      const op1 = this._operationQueue[0] ?? OP_CODES.ALL;
      const op2 = this._operationQueue[1] ?? OP_CODES.NONE;
      const op3 = this._operationQueue[2] ?? OP_CODES.NONE;
      
      for (let i = 0; i < this._actualCount; i++) {
        const i4 = i * 4;
        data[i4 + 0] = 0;    // Current index
        data[i4 + 1] = op1;  // Operation 1
        data[i4 + 2] = op2;  // Operation 2
        data[i4 + 3] = op3;  // Operation 3
      }
      TextureEncoder.updateDataTexture(this._operationQueueTexture, data);
    }
    
    // Update pipeline uniforms
    if (this._pipelineMaterial?.uniforms) {
      this._pipelineMaterial.uniforms.uOperationQueueTexture = { value: this._operationQueueTexture };
      // Enable queue mode by setting uUseQueue if it exists
    }
  }

  /**
   * Clear the operation queue
   */
  clearOperationQueue() {
    this._operationQueue = [];
    if (this._operationQueueTexture) {
      this._operationQueueTexture.dispose();
      this._operationQueueTexture = null;
    }
  }

  /**
   * Get the current operation queue
   * @returns {number[]} Array of operation codes
   */
  getOperationQueue() {
    return [...this._operationQueue];
  }

  /**
   * Write position data back to GPU texture
   * @private
   * @param {Float32Array} data - RGBA position data
   */
  async _writePositionData(data) {
    // Update the data texture
    if (this._positionsTexture) {
      TextureEncoder.updateDataTexture(this._positionsTexture, data);
    }
    
    // Re-initialize render targets with new data
    this._initializeRenderTargetContent();
  }

  /**
   * Write velocity data back to GPU texture
   * @private
   * @param {Float32Array} data - RGBA velocity data
   */
  async _writeVelocityData(data) {
    // Update the data texture
    if (this._velocitiesTexture) {
      TextureEncoder.updateDataTexture(this._velocitiesTexture, data);
    }
    
    // Re-initialize render targets with new data
    this._initializeRenderTargetContent();
  }

  /**
   * Write operation codes data back to GPU texture
   * @private
   * @param {Float32Array} data - RGBA operation codes data
   */
  async _writeOperationCodesData(data) {
    // Update the data texture
    if (this._operationCodesTexture) {
      TextureEncoder.updateDataTexture(this._operationCodesTexture, data);
    }
    
    // Copy to render target
    const copyMaterial = this.shaderManager.createCopyMaterial();
    copyMaterial.uniforms.uTextureResolution.value = new THREE.Vector2(this._textureWidth, this._textureHeight);
    copyMaterial.uniforms.uInputTexture.value = this._operationCodesTexture;
    
    this._fboMesh.material = copyMaterial;
    const opCodesWriteTarget = this.renderTargetPool.getWriteTarget('operationCodes');
    this.renderer.setRenderTarget(opCodesWriteTarget);
    this.renderer.clear();
    this.renderer.render(this._fboScene, this._fboCamera);
    this.renderTargetPool.swap('operationCodes');
    
    // Update uniforms
    const opCodesReadTexture = this.renderTargetPool.getReadTarget('operationCodes').texture;
    this._pipelineMaterial.uniforms.uOperationCodesTexture.value = opCodesReadTexture;
    this._velocityPipelineMaterial.uniforms.uOperationCodesTexture.value = opCodesReadTexture;
    
    this.renderer.setRenderTarget(null);
  }

  /**
   * Write particle states data back to GPU texture
   * @private
   * @param {Float32Array} data - RGBA particle states data
   */
  async _writeParticleStatesData(data) {
    // Update the data texture
    if (this._particleStatesTexture) {
      TextureEncoder.updateDataTexture(this._particleStatesTexture, data);
    }
    
    // Copy to render target
    const copyMaterial = this.shaderManager.createCopyMaterial();
    copyMaterial.uniforms.uTextureResolution.value = new THREE.Vector2(this._textureWidth, this._textureHeight);
    copyMaterial.uniforms.uInputTexture.value = this._particleStatesTexture;
    
    this._fboMesh.material = copyMaterial;
    const statesWriteTarget = this.renderTargetPool.getWriteTarget('particleStates');
    this.renderer.setRenderTarget(statesWriteTarget);
    this.renderer.clear();
    this.renderer.render(this._fboScene, this._fboCamera);
    this.renderTargetPool.swap('particleStates');
    
    // Update uniforms
    const statesReadTexture = this.renderTargetPool.getReadTarget('particleStates').texture;
    this._pipelineMaterial.uniforms.uParticleStatesTexture.value = statesReadTexture;
    this._velocityPipelineMaterial.uniforms.uParticleStatesTexture.value = statesReadTexture;
    
    this.renderer.setRenderTarget(null);
  }

  /**
   * Add a force to the simulation
   * @param {Force} force - Force instance
   */
  addForce(force) {
    if (!force || !force.getUniforms()) return;

    const forceUniforms = force.getUniforms();
    const velocityMat = this.shaderManager.getMaterial('velocity');
    const positionMat = this.shaderManager.getMaterial('position');
    
    // Link force uniforms to shader materials
    for (const [name, uniform] of Object.entries(forceUniforms)) {
      if (velocityMat && velocityMat.uniforms[name]) {
        velocityMat.uniforms[name] = uniform; 
      }
      if (positionMat && positionMat.uniforms[name]) {
        positionMat.uniforms[name] = uniform;
      }
    }
  }

  /**
   * Remove a force from the simulation (unlinks uniforms)
   * @param {Force} force - Force instance
   */
  removeForce(force) {
     // Since we linked by reference, we can't easily "unlink" to restore defaults 
     // without knowing what the defaults were. 
     // For now, this method might be a no-op or we could reset to ShaderManager defaults.
     // Implementing as no-op for now as proper unlinking requires more state tracking.
  }

  /**
   * Clean up all resources
   * Ensures no memory leaks by disposing all WebGL resources
   * and nulling references to help garbage collection
   */
  dispose() {
    // Dispose render targets (WebGL resources)
    this.renderTargetPool.disposeAll();
    
    // Dispose shader materials
    this.shaderManager.dispose();
    
    // Dispose data textures
    this._disposeDataTextures();

    // Dispose operation queue texture
    if (this._operationQueueTexture) {
      this._operationQueueTexture.dispose();
      this._operationQueueTexture = null;
    }

    // Dispose particle geometry
    if (this.particles?.geometry) {
      this.particles.geometry.dispose();
    }

    // Dispose FBO mesh geometry
    if (this._fboMesh?.geometry) {
      this._fboMesh.geometry.dispose();
    }

    // Dispose sampler
    if (this._sampler) {
      this._sampler.dispose();
      this._sampler = null;
    }

    // Null out all references to help garbage collection
    // and prevent accidental use after dispose
    this._positionDataCache = null;
    this._velocityDataCache = null;
    this._cachedUVs = null;
    this._operationQueue = null;
    this._fboScene = null;
    this._fboCamera = null;
    this._fboMesh = null;
    this.particles = null;
    
    // Null out material references
    this._positionMaterial = null;
    this._velocityMaterial = null;
    this._pipelineMaterial = null;
    this._velocityPipelineMaterial = null;
    this._particleMaterial = null;
    
    // Mark as disposed to prevent further operations
    this.state = ParticleSystemState.IDLE;
    this._disposed = true;
  }

  /**
   * Check if the system has been disposed
   * @returns {boolean}
   */
  isDisposed() {
    return this._disposed === true;
  }
}

