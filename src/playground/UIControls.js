import { PARTICLES, TIMING } from '../core/constants.js';
import { getPresetNames, getPreset } from './presets.js';

/**
 * UI Controls for the particle playground
 * Manages the control panel and user inputs
 */
export class UIControls {
  /**
   * @param {PlaygroundApp} app - The playground application
   * @param {Object} options - UI options
   */
  constructor(app, options = {}) {
    this.app = app;
    this.options = {
      containerId: 'controls',
      ...options
    };

    this.container = null;
    this.elements = {};
    
    // Debounce timers
    this._textUpdateTimeout = null;
    this._countUpdateTimeout = null;

    // Current values
    this._currentText = '1,000,000\nPARTICLES';
    this._currentCount = PARTICLES.DEFAULT_COUNT;
    this._runtimeMode = true;
  }

  /**
   * Create the UI controls
   * @param {HTMLElement} parent - Parent element to append controls to
   */
  create(parent) {
    this.container = document.createElement('div');
    this.container.id = this.options.containerId;
    this.container.className = 'controls';
    
    this.container.innerHTML = `
      <h3>Particle Controls</h3>
      
      <div class="controls-group">
        <div class="controls-label">
          <span>Text</span>
        </div>
        <textarea id="textInput" class="controls-textarea" placeholder="Enter text (use newlines for multiple lines)">${this._currentText}</textarea>
      </div>
      
      <div class="controls-group">
        <div class="controls-checkbox">
          <input type="checkbox" id="runtimeModeCheckbox" ${this._runtimeMode ? 'checked' : ''}>
          <label for="runtimeModeCheckbox">Smooth Transition</label>
        </div>
      </div>
      
      <div class="controls-group">
        <div class="controls-label">
          <span>Particle Count</span>
          <span id="particleCountDisplay">${this._currentCount.toLocaleString()}</span>
        </div>
        <div class="controls-max-display" id="maxParticleCountDisplay">Max: ${PARTICLES.MAX_COUNT.toLocaleString()}</div>
        <input type="range" id="particleCountSlider" class="controls-slider" 
          min="${PARTICLES.MIN_COUNT}" 
          max="${PARTICLES.MAX_COUNT}" 
          step="1000" 
          value="${this._currentCount}">
        <input type="number" id="particleCountInput" class="controls-input" 
          min="${PARTICLES.MIN_COUNT}" 
          max="${PARTICLES.MAX_COUNT}" 
          step="1000" 
          value="${this._currentCount}">
      </div>
      
      <div class="controls-group">
        <div class="controls-label">
          <span>Presets</span>
        </div>
        <select id="presetSelect" class="controls-input">
          ${getPresetNames().map(name => 
            `<option value="${name}">${getPreset(name).name}</option>`
          ).join('')}
        </select>
      </div>
    `;

    parent.appendChild(this.container);
    
    // Cache element references
    this._cacheElements();
    
    // Setup event listeners
    this._setupEventListeners();
  }

  /**
   * Cache DOM element references
   * @private
   */
  _cacheElements() {
    this.elements = {
      textInput: document.getElementById('textInput'),
      runtimeModeCheckbox: document.getElementById('runtimeModeCheckbox'),
      particleCountSlider: document.getElementById('particleCountSlider'),
      particleCountInput: document.getElementById('particleCountInput'),
      particleCountDisplay: document.getElementById('particleCountDisplay'),
      maxParticleCountDisplay: document.getElementById('maxParticleCountDisplay'),
      presetSelect: document.getElementById('presetSelect')
    };
  }

  /**
   * Setup event listeners
   * @private
   */
  _setupEventListeners() {
    const { 
      textInput, 
      runtimeModeCheckbox, 
      particleCountSlider, 
      particleCountInput,
      presetSelect 
    } = this.elements;

    // Text input
    textInput.addEventListener('input', (e) => {
      this._debouncedTextUpdate(e.target.value);
    });

    textInput.addEventListener('blur', (e) => {
      this._clearTextTimeout();
      this._updateText(e.target.value);
    });

    // Runtime mode checkbox
    runtimeModeCheckbox.addEventListener('change', (e) => {
      this._runtimeMode = e.target.checked;
    });

    // Particle count slider
    particleCountSlider.addEventListener('input', (e) => {
      const value = parseInt(e.target.value);
      particleCountInput.value = value;
      this._updateCountDisplay(value);
      this._debouncedCountUpdate(value);
    });

    // Particle count input
    particleCountInput.addEventListener('input', (e) => {
      let value = parseInt(e.target.value);
      if (isNaN(value)) value = this._currentCount;
      value = this._clampCount(value);
      
      particleCountSlider.value = value;
      this._updateCountDisplay(value);
      this._debouncedCountUpdate(value);
    });

    particleCountInput.addEventListener('blur', (e) => {
      let value = parseInt(e.target.value);
      if (isNaN(value)) value = this._currentCount;
      value = this._clampCount(value);
      
      particleCountSlider.value = value;
      particleCountInput.value = value;
      this._clearCountTimeout();
      this._updateCount(value);
    });

    // Preset select
    presetSelect.addEventListener('change', (e) => {
      this._applyPreset(e.target.value);
    });
  }

  /**
   * Debounced text update
   * @private
   */
  _debouncedTextUpdate(text) {
    this._clearTextTimeout();
    this._textUpdateTimeout = setTimeout(() => {
      this._updateText(text);
    }, TIMING.TEXT_INPUT_DEBOUNCE);
  }

  /**
   * Clear text update timeout
   * @private
   */
  _clearTextTimeout() {
    if (this._textUpdateTimeout) {
      clearTimeout(this._textUpdateTimeout);
      this._textUpdateTimeout = null;
    }
  }

  /**
   * Update text
   * @private
   */
  _updateText(text) {
    if (!text || text.trim().length === 0) return;
    if (text === this._currentText) return;

    this._currentText = text;
    this.app.updateText(text, this._runtimeMode);
  }

  /**
   * Debounced count update
   * @private
   */
  _debouncedCountUpdate(count) {
    this._clearCountTimeout();
    this._countUpdateTimeout = setTimeout(() => {
      this._updateCount(count);
    }, TIMING.PARTICLE_COUNT_DEBOUNCE);
  }

  /**
   * Clear count update timeout
   * @private
   */
  _clearCountTimeout() {
    if (this._countUpdateTimeout) {
      clearTimeout(this._countUpdateTimeout);
      this._countUpdateTimeout = null;
    }
  }

  /**
   * Update particle count
   * @private
   */
  _updateCount(count) {
    count = this._clampCount(count);
    if (count === this._currentCount) return;

    this._currentCount = count;
    this.app.updateParticleCount(count);
  }

  /**
   * Update count display
   * @private
   */
  _updateCountDisplay(count) {
    this.elements.particleCountDisplay.textContent = count.toLocaleString();
  }

  /**
   * Clamp count to valid range
   * @private
   */
  _clampCount(count) {
    return Math.max(PARTICLES.MIN_COUNT, Math.min(PARTICLES.MAX_COUNT, count));
  }

  /**
   * Apply a preset
   * @private
   */
  async _applyPreset(presetName) {
    const preset = getPreset(presetName);
    
    // Update UI
    this.elements.textInput.value = preset.text;
    this.elements.particleCountSlider.value = preset.particleCount;
    this.elements.particleCountInput.value = preset.particleCount;
    this._updateCountDisplay(preset.particleCount);

    // Update internal state
    this._currentText = preset.text;
    this._currentCount = preset.particleCount;

    // Apply to app
    await this.app.applyPreset(presetName);
  }

  /**
   * Set text programmatically
   * @param {string} text
   */
  setText(text) {
    this._currentText = text;
    if (this.elements.textInput) {
      this.elements.textInput.value = text;
    }
  }

  /**
   * Set particle count programmatically
   * @param {number} count
   */
  setParticleCount(count) {
    count = this._clampCount(count);
    this._currentCount = count;
    
    if (this.elements.particleCountSlider) {
      this.elements.particleCountSlider.value = count;
    }
    if (this.elements.particleCountInput) {
      this.elements.particleCountInput.value = count;
    }
    this._updateCountDisplay(count);
  }

  /**
   * Update max particle count display
   * @param {number} maxCount
   */
  updateMaxCount(maxCount) {
    if (this.elements.maxParticleCountDisplay) {
      this.elements.maxParticleCountDisplay.textContent = `Max: ${maxCount.toLocaleString()}`;
    }
    if (this.elements.particleCountSlider) {
      this.elements.particleCountSlider.max = maxCount;
    }
    if (this.elements.particleCountInput) {
      this.elements.particleCountInput.max = maxCount;
    }
  }

  /**
   * Clean up
   */
  dispose() {
    this._clearTextTimeout();
    this._clearCountTimeout();
    
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}

