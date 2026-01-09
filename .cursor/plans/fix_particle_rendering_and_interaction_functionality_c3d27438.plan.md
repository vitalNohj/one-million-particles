---
name: Fix Particle Rendering and Interaction Functionality
overview: ""
todos:
  - id: shader-import
    content: Import `particle.vert` and `particle.frag` in `src/core/ShaderManager.js`
    status: pending
  - id: remove-old-material
    content: Remove `PointsMaterial` and `onBeforeCompile` logic in `createParticleMaterial`
    status: pending
    dependencies:
      - shader-import
  - id: create-shader-material
    content: Instantiate `THREE.ShaderMaterial` with imported shaders in `ShaderManager.js`
    status: pending
    dependencies:
      - remove-old-material
  - id: define-uniforms
    content: Define uniforms (`uPositionsTexture`, `uColorTexture`, `uHighlightColor`, `uOpacity`) for the new material
    status: pending
    dependencies:
      - create-shader-material
  - id: set-material-properties
    content: Set `blending`, `depthWrite`, `transparent` on the new material
    status: pending
    dependencies:
      - create-shader-material
  - id: compatibility-alias
    content: Alias `userData.uniforms = uniforms` for compatibility in `ShaderManager.js`
    status: pending
    dependencies:
      - create-shader-material
  - id: filter-original-pos
    content: "Set `minFilter: THREE.NearestFilter` on `_originalPositionsTexture`"
    status: pending
  - id: filter-original-pos-mag
    content: "Set `magFilter: THREE.NearestFilter` on `_originalPositionsTexture`"
    status: pending
  - id: filter-pos
    content: "Set `minFilter: THREE.NearestFilter` on `_positionsTexture`"
    status: pending
  - id: filter-pos-mag
    content: "Set `magFilter: THREE.NearestFilter` on `_positionsTexture`"
    status: pending
  - id: filter-vel
    content: "Set `minFilter: THREE.NearestFilter` on `_velocitiesTexture`"
    status: pending
  - id: filter-vel-mag
    content: "Set `magFilter: THREE.NearestFilter` on `_velocitiesTexture`"
    status: pending
  - id: verify-create-points
    content: Verify `this._particleMaterial.uniforms` usage in `_createParticlePoints`
    status: pending
    dependencies:
      - compatibility-alias
  - id: verify-update-loop
    content: Verify `this._particleMaterial.uniforms` usage in `update` method
    status: pending
    dependencies:
      - compatibility-alias
  - id: cleanup-shader-manager
    content: Clean up unused imports in `ShaderManager.js`
    status: pending
    dependencies:
      - remove-old-material
  - id: add-pointsize-uniform
    content: Add `uPointSize` uniform to `particle.vert` for configurable point size
    status: pending
    dependencies:
      - shader-import
  - id: add-size-attenuation
    content: Add distance-based size attenuation in `particle.vert`
    status: pending
    dependencies:
      - add-pointsize-uniform
  - id: add-color-fallback
    content: Add fallback color in `particle.frag` when `uColorTexture` is null
    status: pending
    dependencies:
      - shader-import
  - id: api-set-pointsize
    content: Add `setPointSize(size)` method to `GPGPUParticleSystem`
    status: pending
    dependencies:
      - add-pointsize-uniform
  - id: api-set-opacity
    content: Add `setOpacity(opacity)` method to `GPGPUParticleSystem`
    status: pending
    dependencies:
      - define-uniforms
  - id: api-set-highlight
    content: Add `setHighlightColor(r, g, b)` method to `GPGPUParticleSystem`
    status: pending
    dependencies:
      - define-uniforms
  - id: api-set-noise
    content: Add `setNoiseParams(frequency, amplitude)` method to `GPGPUParticleSystem`
    status: pending
    dependencies:
      - define-uniforms
  - id: create-force-base
    content: Create `src/interaction/Force.js` base class with `apply(position, velocity)` interface
    status: pending
  - id: refactor-interaction-force
    content: Refactor `InteractionForce.js` to extend the new `Force` base class
    status: pending
    dependencies:
      - create-force-base
  - id: api-add-remove-force
    content: Add `addForce(force)` and `removeForce(force)` methods to `GPGPUParticleSystem`
    status: pending
    dependencies:
      - create-force-base
  - id: create-gravity-force
    content: Create `GravityForce.js` as example extensible force
    status: pending
    dependencies:
      - create-force-base
  - id: create-attractor-force
    content: Create `AttractorForce.js` as example point-based force
    status: pending
    dependencies:
      - create-force-base
  - id: sampler-getuvs
    content: Add `getUVs(count)` method to `BaseSampler` interface
    status: pending
  - id: textsampler-getuvs
    content: Implement `getUVs()` in `TextSampler` for proper color mapping
    status: pending
    dependencies:
      - sampler-getuvs
  - id: meshsampler-getuvs
    content: Implement `getUVs()` in `MeshSampler` using mesh UVs
    status: pending
    dependencies:
      - sampler-getuvs
  - id: jsdoc-particle-system
    content: Add JSDoc comments to all public methods in `GPGPUParticleSystem`
    status: pending
  - id: error-handling-shaders
    content: Add error handling for shader compilation failures in `ShaderManager`
    status: pending
  - id: export-forces
    content: Export new Force classes from `src/interaction/index.js`
    status: pending
    dependencies:
      - create-force-base
      - create-gravity-force
      - create-attractor-force
  - id: todo-1767949983573-ixphuzc27
    content: Create HTML/UI Dev Menu options for all the parameters and functionality
    status: pending
---

# Fix Particle Rendering and Interaction Functionality

The "visual glitch" and loss of functionality are caused by two issues:

1.  **Material Mismatch**: The system is using a hacked `PointsMaterial` (via `onBeforeCompile`) which introduces unwanted size attenuation and relies on internal behavior, causing visual instability/jitter. The project contains explicit `particle.vert` and `particle.frag` shaders that enforce a stable `gl_PointSize` and correct behavior, but they were unused.
2.  **Texture Filtering**: The GPGPU data textures default to `LinearFilter`, which can cause sampling artifacts during initialization or if the system falls back to them. They must be explicitly set to `NearestFilter`.

This plan switches the rendering to use a `ShaderMaterial` with the dedicated shader files (restoring the intended "functionality") and ensures data integrity with proper texture filtering.---

## Phase 1: Core Fixes

### 1.1 Update `src/core/ShaderManager.js`

-   Import `particle.vert` and `particle.frag`.
-   Refactor `createParticleMaterial` to return a `THREE.ShaderMaterial` instead of `PointsMaterial`.
-   Configure the material with the explicit shaders and correct uniforms.
-   Alias `userData.uniforms = uniforms` for backward compatibility.

### 1.2 Update `src/core/GPGPUParticleSystem.js`

-   Set `minFilter` and `magFilter` to `THREE.NearestFilter` on all data textures.
-   Update uniform access to use `this._particleMaterial.uniforms` directly.

### 1.3 Verify `src/utils/BufferUtils.js`

-   Keep the `+ 0.5` offset fix for UV coordinates.

---

## Phase 2: Shader Improvements

### 2.1 Update `src/shaders/render/particle.vert`

-   Add `uPointSize` uniform for configurable point size.
-   Add distance-based size attenuation for proper 3D perspective.

### 2.2 Update `src/shaders/render/particle.frag`

-   Add fallback when `uColorTexture` is null (use white or highlight color).
-   Ensure proper alpha handling for additive blending.

---

## Phase 3: Extensibility Enhancements

### 3.1 Expose Runtime-Configurable Uniforms

-   Add setter methods in `GPGPUParticleSystem` for:
    - `setPointSize(size)`
    - `setOpacity(opacity)`
    - `setHighlightColor(r, g, b)`
    - `setNoiseParams(frequency, amplitude)`

### 3.2 Add Forces System

-   Create `src/interaction/Force.js` base class.
-   Refactor pointer interaction to use Force system.
-   Enable adding multiple forces (gravity, wind, attractors).

### 3.3 Improve Sampler Interface

-   Ensure all samplers implement consistent `prepare()`, `sample()`, `dispose()`.
-   Add `getUVs()` method to samplers for proper color texture mapping.

---

## Architecture

```mermaid
graph TD
    A[GPGPUParticleSystem] -->|Creates| B(ShaderManager)
    B -->|Returns| C[ShaderMaterial]
    C -->|Vertex Shader| D[particle.vert]
    C -->|Fragment Shader| E[particle.frag]
    D -->|Samples| F[GPGPU Position Texture]
    A -->|Uses| G[Forces System]
    G -->|Contains| H[PointerForce]
    G -->|Contains| I[GravityForce]
    G -->|Contains| J[AttractorForce]






```