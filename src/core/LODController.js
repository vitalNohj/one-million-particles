import { LOD, PARTICLES } from './constants.js';

/**
 * Level of Detail controller for the particle system
 * Automatically adjusts particle count based on performance and camera distance
 */
export class LODController {
  /**
   * @param {Object} options - LOD configuration
   * @param {boolean} options.enabled - Enable LOD (default: true)
   * @param {number} options.minCount - Minimum particle count
   * @param {number} options.maxCount - Maximum particle count
   * @param {number} options.targetFPS - Target frame rate
   * @param {number} options.minFPS - Minimum acceptable FPS
   * @param {number} options.adjustmentRate - How aggressively to adjust
   */
  constructor(options = {}) {
    this.enabled = options.enabled ?? true;
    this.minCount = options.minCount ?? PARTICLES.MIN_COUNT;
    this.maxCount = options.maxCount ?? PARTICLES.MAX_COUNT;
    this.targetFPS = options.targetFPS ?? LOD.TARGET_FPS;
    this.minFPS = options.minFPS ?? LOD.MIN_FPS;
    this.adjustmentRate = options.adjustmentRate ?? LOD.ADJUSTMENT_RATE;
    
    // Distance-based LOD
    this.nearDistance = options.nearDistance ?? LOD.NEAR_DISTANCE;
    this.farDistance = options.farDistance ?? LOD.FAR_DISTANCE;
    this.farParticleRatio = options.farParticleRatio ?? LOD.FAR_PARTICLE_RATIO;
    
    // Internal state
    this._currentCount = this.maxCount;
    this._targetCount = this.maxCount;
    this._fpsHistory = [];
    this._historySize = 30; // Track last 30 frames
    this._lastUpdateTime = 0;
    this._updateInterval = 500; // Check LOD every 500ms
    
    // Callbacks
    this._onCountChange = null;
  }

  /**
   * Set callback for when particle count should change
   * @param {Function} callback - (newCount) => void
   */
  onCountChange(callback) {
    this._onCountChange = callback;
  }

  /**
   * Record a frame time for FPS calculation
   * @param {number} deltaTime - Time since last frame in seconds
   */
  recordFrame(deltaTime) {
    if (!this.enabled) return;
    
    const fps = 1 / Math.max(deltaTime, 0.001);
    this._fpsHistory.push(fps);
    
    // Keep history bounded
    if (this._fpsHistory.length > this._historySize) {
      this._fpsHistory.shift();
    }
  }

  /**
   * Get average FPS from recent history
   * @returns {number}
   */
  getAverageFPS() {
    if (this._fpsHistory.length === 0) return this.targetFPS;
    
    const sum = this._fpsHistory.reduce((a, b) => a + b, 0);
    return sum / this._fpsHistory.length;
  }

  /**
   * Calculate particle count based on camera distance
   * @param {number} distance - Distance from camera to particle system center
   * @returns {number} Adjusted max particle count
   */
  getDistanceBasedMax(distance) {
    if (distance <= this.nearDistance) {
      return this.maxCount;
    }
    
    if (distance >= this.farDistance) {
      return Math.floor(this.maxCount * this.farParticleRatio);
    }
    
    // Linear interpolation between near and far
    const t = (distance - this.nearDistance) / (this.farDistance - this.nearDistance);
    const ratio = 1 - t * (1 - this.farParticleRatio);
    
    return Math.floor(this.maxCount * ratio);
  }

  /**
   * Update LOD based on current performance
   * @param {number} currentTime - Current time in milliseconds
   * @param {number} cameraDistance - Optional camera distance for distance-based LOD
   * @returns {number|null} New particle count if changed, null otherwise
   */
  update(currentTime, cameraDistance = null) {
    if (!this.enabled) return null;
    
    // Rate-limit updates
    if (currentTime - this._lastUpdateTime < this._updateInterval) {
      return null;
    }
    this._lastUpdateTime = currentTime;
    
    const avgFPS = this.getAverageFPS();
    let effectiveMax = this.maxCount;
    
    // Apply distance-based LOD if distance provided
    if (cameraDistance !== null) {
      effectiveMax = this.getDistanceBasedMax(cameraDistance);
    }
    
    // Adjust based on FPS
    if (avgFPS < this.minFPS) {
      // Performance is bad, reduce particles significantly
      this._targetCount = Math.max(
        this.minCount,
        Math.floor(this._currentCount * (1 - this.adjustmentRate * 2))
      );
    } else if (avgFPS < this.targetFPS) {
      // Below target, reduce particles gradually
      this._targetCount = Math.max(
        this.minCount,
        Math.floor(this._currentCount * (1 - this.adjustmentRate))
      );
    } else if (avgFPS > this.targetFPS + 10 && this._currentCount < effectiveMax) {
      // Performance is good and we're below max, increase particles
      this._targetCount = Math.min(
        effectiveMax,
        Math.floor(this._currentCount * (1 + this.adjustmentRate))
      );
    }
    
    // Clamp to effective max
    this._targetCount = Math.min(this._targetCount, effectiveMax);
    
    // Only trigger change if significant
    const changeThreshold = this._currentCount * 0.05; // 5% change threshold
    if (Math.abs(this._targetCount - this._currentCount) > changeThreshold) {
      this._currentCount = this._targetCount;
      
      if (this._onCountChange) {
        this._onCountChange(this._currentCount);
      }
      
      return this._currentCount;
    }
    
    return null;
  }

  /**
   * Force set the current particle count
   * @param {number} count
   */
  setCount(count) {
    this._currentCount = Math.max(this.minCount, Math.min(this.maxCount, count));
    this._targetCount = this._currentCount;
  }

  /**
   * Get current particle count
   * @returns {number}
   */
  getCount() {
    return this._currentCount;
  }

  /**
   * Get LOD statistics
   * @returns {Object}
   */
  getStats() {
    return {
      enabled: this.enabled,
      currentCount: this._currentCount,
      targetCount: this._targetCount,
      avgFPS: this.getAverageFPS(),
      minCount: this.minCount,
      maxCount: this.maxCount
    };
  }

  /**
   * Reset LOD to maximum
   */
  reset() {
    this._currentCount = this.maxCount;
    this._targetCount = this.maxCount;
    this._fpsHistory = [];
  }

  /**
   * Enable or disable LOD
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.reset();
    }
  }
}

