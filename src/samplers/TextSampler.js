import * as THREE from 'three';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshSampler } from './MeshSampler.js';
import { TEXT } from '../core/constants.js';

/**
 * Samples points from 3D text geometry
 * Supports multi-line text and delegates to MeshSampler
 */
export class TextSampler extends MeshSampler {
  /**
   * @param {string} text - The text to create geometry from
   * @param {THREE.Font} font - Loaded Three.js font
   * @param {Object} options - Text geometry options
   * @param {number} options.size - Font size (default: 3)
   * @param {number} options.depth - Extrusion depth (default: 1)
   * @param {number} options.bevelThickness - Bevel thickness (default: 0)
   * @param {number} options.bevelSize - Bevel size (default: 0.01)
   * @param {boolean} options.bevelEnabled - Enable bevel (default: true)
   * @param {number} options.lineHeight - Line height multiplier (default: 1.2)
   */
  constructor(text, font, options = {}) {
    // Create a temporary mesh, will be replaced in prepare()
    const tempGeometry = new THREE.BufferGeometry();
    const tempMesh = new THREE.Mesh(tempGeometry, new THREE.MeshBasicMaterial());
    
    super(tempMesh);
    
    this.text = text;
    this.font = font;
    this.textOptions = {
      size: TEXT.DEFAULT_SIZE,
      depth: TEXT.DEFAULT_DEPTH,
      bevelThickness: TEXT.BEVEL_THICKNESS,
      bevelSize: TEXT.BEVEL_SIZE,
      bevelEnabled: TEXT.BEVEL_ENABLED,
      lineHeight: TEXT.LINE_HEIGHT_MULTIPLIER,
      ...options
    };
    
    this._disposables = [];
  }

  /**
   * Load a font from a URL
   * @param {string} url - Font JSON URL
   * @returns {Promise<THREE.Font>}
   */
  static async loadFont(url) {
    return new Promise((resolve, reject) => {
      const loader = new FontLoader();
      loader.load(
        url,
        (font) => resolve(font),
        undefined,
        (error) => reject(error)
      );
    });
  }

  /**
   * Create text geometry, handling multi-line text
   * @private
   */
  _createTextGeometry() {
    const lines = this.text.split('\n').filter(line => line.trim().length > 0);
    
    if (lines.length === 0) {
      return null;
    }

    const geometries = [];
    const lineHeight = this.textOptions.size * this.textOptions.lineHeight;
    
    // Create geometry for each line
    const lineData = [];
    for (const line of lines) {
      const geometry = new TextGeometry(line, {
        font: this.font,
        size: this.textOptions.size,
        depth: this.textOptions.depth,
        bevelThickness: this.textOptions.bevelThickness,
        bevelSize: this.textOptions.bevelSize,
        bevelEnabled: this.textOptions.bevelEnabled
      });
      geometry.computeBoundingBox();
      lineData.push({ geometry, text: line });
      this._disposables.push(geometry);
    }

    // Calculate total height for centering
    let totalHeight = 0;
    for (const { geometry } of lineData) {
      const height = geometry.boundingBox.max.y - geometry.boundingBox.min.y;
      totalHeight += height;
    }
    totalHeight += (lines.length - 1) * lineHeight;

    // Position each line and collect geometries
    let currentY = totalHeight / 2;
    for (const { geometry } of lineData) {
      const height = geometry.boundingBox.max.y - geometry.boundingBox.min.y;
      const width = geometry.boundingBox.max.x - geometry.boundingBox.min.x;
      
      // Center horizontally and position vertically
      geometry.translate(-width / 2, currentY - height / 2, 0);
      
      currentY -= (height + lineHeight);
      geometries.push(geometry);
    }

    // Merge all line geometries
    if (geometries.length === 1) {
      return geometries[0];
    }
    
    const merged = BufferGeometryUtils.mergeGeometries(geometries);
    this._disposables.push(merged);
    return merged;
  }

  /**
   * Build the text mesh and prepare for sampling
   * @returns {Promise<void>}
   */
  async prepare() {
    if (!this.font) {
      throw new Error('TextSampler: No font provided');
    }

    // Create the text geometry
    const geometry = this._createTextGeometry();
    if (!geometry) {
      throw new Error('TextSampler: Failed to create text geometry');
    }

    // Create the mesh for sampling
    const material = new THREE.MeshBasicMaterial();
    this._disposables.push(material);
    
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.updateMatrixWorld();

    // Call parent prepare to build the surface sampler
    await super.prepare();
  }

  /**
   * Update the text (creates new geometry)
   * @param {string} newText - The new text
   * @returns {Promise<void>}
   */
  async updateText(newText) {
    if (newText === this.text) return;
    
    this.text = newText;
    this.isReady = false;
    
    // Dispose old resources
    this._disposeGeometry();
    
    // Rebuild
    await this.prepare();
  }

  /**
   * Dispose geometry resources
   * @private
   */
  _disposeGeometry() {
    for (const disposable of this._disposables) {
      disposable.dispose();
    }
    this._disposables = [];
  }

  /**
   * Sample with text-specific centering
   * @param {number} count
   * @returns {Float32Array}
   */
  sample(count) {
    // Call parent's sample directly, then center
    const data = super.sample(count);
    
    // Center the positions
    const centerOffset = this.getCenter();
    for (let i = 0; i < count; i++) {
      const i4 = i * 4;
      data[i4 + 0] -= centerOffset.x;
      data[i4 + 1] -= centerOffset.y;
      data[i4 + 2] -= centerOffset.z;
    }
    
    return data;
  }

  /**
   * Clean up all resources
   */
  dispose() {
    this._disposeGeometry();
    super.dispose();
  }
}

/**
 * Create a TextSampler with async font loading
 * @param {string} text - The text
 * @param {string} fontUrl - URL to font JSON
 * @param {Object} options - Text options
 * @returns {Promise<TextSampler>}
 */
export async function createTextSampler(text, fontUrl, options = {}) {
  const font = await TextSampler.loadFont(fontUrl);
  const sampler = new TextSampler(text, font, options);
  await sampler.prepare();
  return sampler;
}

