import * as THREE from 'three';
import { PHYSICS } from '../core/constants.js';

/**
 * Handles mouse and touch input for particle interaction
 * Normalizes pointer position and provides raycasting
 */
export class PointerHandler {
  /**
   * @param {HTMLElement} domElement - Element to listen for events on
   * @param {THREE.Camera} camera - Camera for raycasting
   */
  constructor(domElement, camera) {
    this.domElement = domElement;
    this.camera = camera;
    
    // Pointer state
    this.pointer = new THREE.Vector2();
    this.pointerWorld = new THREE.Vector3();
    this.pointerStart = new THREE.Vector3();
    this.isPointerDown = false;
    this.isPointerOver = false;
    
    // Raycaster for 3D position
    this.raycaster = new THREE.Raycaster();
    this.intersectPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    this._intersectPoint = new THREE.Vector3();
    
    // Pointer start sampling
    this._pointerStartCountdown = 0;
    this._pointerSampleInterval = PHYSICS.POINTER_SAMPLE_INTERVAL;
    
    // Bind event handlers
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onPointerEnter = this._onPointerEnter.bind(this);
    this._onPointerLeave = this._onPointerLeave.bind(this);
    
    this._addEventListeners();
  }

  /**
   * Add event listeners
   * @private
   */
  _addEventListeners() {
    this.domElement.addEventListener('pointermove', this._onPointerMove);
    this.domElement.addEventListener('pointerdown', this._onPointerDown);
    this.domElement.addEventListener('pointerup', this._onPointerUp);
    this.domElement.addEventListener('pointerenter', this._onPointerEnter);
    this.domElement.addEventListener('pointerleave', this._onPointerLeave);
  }

  /**
   * Remove event listeners
   * @private
   */
  _removeEventListeners() {
    this.domElement.removeEventListener('pointermove', this._onPointerMove);
    this.domElement.removeEventListener('pointerdown', this._onPointerDown);
    this.domElement.removeEventListener('pointerup', this._onPointerUp);
    this.domElement.removeEventListener('pointerenter', this._onPointerEnter);
    this.domElement.removeEventListener('pointerleave', this._onPointerLeave);
  }

  /**
   * Handle pointer move
   * @private
   */
  _onPointerMove(event) {
    const rect = this.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  /**
   * Handle pointer down
   * @private
   */
  _onPointerDown(event) {
    this.isPointerDown = true;
  }

  /**
   * Handle pointer up
   * @private
   */
  _onPointerUp(event) {
    this.isPointerDown = false;
  }

  /**
   * Handle pointer enter
   * @private
   */
  _onPointerEnter(event) {
    this.isPointerOver = true;
  }

  /**
   * Handle pointer leave
   * @private
   */
  _onPointerLeave(event) {
    this.isPointerOver = false;
  }

  /**
   * Update raycaster and compute world position
   * @param {THREE.Object3D} target - Optional object to raycast against
   * @param {THREE.Vector3} offset - Optional offset to subtract from intersection
   */
  update(target = null, offset = null) {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    
    if (target) {
      // Raycast against specific object
      const intersects = this.raycaster.intersectObject(target, false);
      if (intersects.length > 0) {
        this.pointerWorld.copy(intersects[0].point);
      }
    } else {
      // Raycast against the intersection plane
      this.raycaster.ray.intersectPlane(this.intersectPlane, this._intersectPoint);
      if (this._intersectPoint) {
        this.pointerWorld.copy(this._intersectPoint);
      }
    }
    
    // Apply offset if provided
    if (offset) {
      this.pointerWorld.sub(offset);
    }
    
    // Update pointer start position periodically
    this._pointerStartCountdown--;
    if (this._pointerStartCountdown <= 0) {
      this.pointerStart.copy(this.pointerWorld);
      this._pointerStartCountdown = this._pointerSampleInterval;
    }
  }

  /**
   * Set the intersection plane for raycasting
   * @param {THREE.Vector3} normal - Plane normal
   * @param {number} constant - Plane constant (distance from origin)
   */
  setIntersectionPlane(normal, constant = 0) {
    this.intersectPlane.set(normal, constant);
  }

  /**
   * Set the intersection plane to face the camera at a specific Z depth
   * @param {number} zDepth - Z position of the plane
   */
  setIntersectionPlaneZ(zDepth) {
    this.intersectPlane.set(new THREE.Vector3(0, 0, 1), -zDepth);
  }

  /**
   * Get the normalized pointer position (NDC)
   * @returns {THREE.Vector2}
   */
  getPointer() {
    return this.pointer;
  }

  /**
   * Get the world space pointer position
   * @returns {THREE.Vector3}
   */
  getWorldPosition() {
    return this.pointerWorld;
  }

  /**
   * Get the pointer start position (sampled periodically)
   * @returns {THREE.Vector3}
   */
  getStartPosition() {
    return this.pointerStart;
  }

  /**
   * Check if pointer is currently interacting
   * @returns {boolean}
   */
  isInteracting() {
    return this.isPointerOver;
  }

  /**
   * Clean up
   */
  dispose() {
    this._removeEventListeners();
  }
}

