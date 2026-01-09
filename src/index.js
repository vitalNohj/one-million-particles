/**
 * GPGPU Particle System - Main Entry Point
 * 
 * A modular GPGPU particle system for Three.js
 * Supports any geometry source with smooth morphing transitions
 */

// Core exports
export { GPGPUParticleSystem } from './core/GPGPUParticleSystem.js';
export { RenderTargetPool } from './core/RenderTargetPool.js';
export { ShaderManager } from './core/ShaderManager.js';
export { LODController } from './core/LODController.js';
export * from './core/constants.js';

// Sampler exports
export { BaseSampler } from './samplers/BaseSampler.js';
export { MeshSampler } from './samplers/MeshSampler.js';
export { TextSampler, createTextSampler } from './samplers/TextSampler.js';
export { PointCloudSampler } from './samplers/PointCloudSampler.js';

// Interaction exports
export { PointerHandler } from './interaction/PointerHandler.js';
export { InteractionForce, ForceType, ForceManager } from './interaction/InteractionForce.js';

// Playground exports
export { PlaygroundApp } from './playground/PlaygroundApp.js';
export { UIControls } from './playground/UIControls.js';
export { Presets, getPreset, getPresetNames } from './playground/presets.js';

// Buffer utilities
export { bufferPool, createPositionData, createVelocityData, createParticleAttributes } from './utils/BufferUtils.js';

