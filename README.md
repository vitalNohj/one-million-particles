# GPGPU Particle System

A modular GPGPU particle system playground built with Three.js and WebGL. Renders up to 10 million particles in real-time using GPU compute techniques.

![Demo](https://github.com/poeti8/what-can-you-do-with-a-particle/assets/23660003/31e2fae0-2e61-4d0b-a37c-45c89f2cd23e.gif)

## Features

- **GPGPU Particle Simulation** - Positions and velocities computed entirely on the GPU
- **Any Geometry Source** - Particles can form any mesh surface (text, 3D models, point clouds)
- **Smooth Morphing** - Particles animate smoothly between different shapes
- **Interactive** - Particles respond to mouse/touch interaction
- **LOD System** - Automatic particle count adjustment based on performance
- **Modular Architecture** - Clean separation of concerns for easy extension

## Project Structure

```
src/
├── core/                    # Core particle system
│   ├── GPGPUParticleSystem.js   # Main particle system class
│   ├── RenderTargetPool.js      # FBO management
│   ├── ShaderManager.js         # Shader compilation & caching
│   ├── LODController.js         # Performance-based LOD
│   └── constants.js             # Configuration constants
│
├── samplers/                # Geometry samplers
│   ├── BaseSampler.js           # Abstract interface
│   ├── MeshSampler.js           # Sample any mesh surface
│   ├── TextSampler.js           # 3D text geometry
│   └── PointCloudSampler.js     # Direct point input
│
├── shaders/                 # GLSL shaders
│   ├── compute/                 # GPU compute shaders
│   ├── render/                  # Particle rendering shaders
│   └── includes/                # Shared shader code
│
├── interaction/             # Input handling
│   ├── PointerHandler.js        # Mouse/touch input
│   └── InteractionForce.js      # Force application
│
├── playground/              # Demo application
│   ├── PlaygroundApp.js         # Main app
│   ├── UIControls.js            # Control panel
│   └── presets.js               # Demo presets
│
└── index.js                 # Library exports
```

## Quick Start

### Install Dependencies

```bash
npm install
```

### Run Development Server

```bash
npm run dev
```

This starts a Vite dev server at `http://localhost:3000`.

### Build for Production

```bash
npm run build
```

## Usage

### Basic Usage

```javascript
import { GPGPUParticleSystem, TextSampler } from './src/index.js';

// Create particle system
const particles = new GPGPUParticleSystem(renderer, {
  count: 1_000_000
});

// Create a text sampler
const sampler = new TextSampler('HELLO', font);
await sampler.prepare();

// Set the source geometry
await particles.setSource(sampler);

// Add to scene
scene.add(particles.particles);

// Update in render loop
function animate() {
  particles.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
```

### Morphing Between Shapes

```javascript
// Create a new sampler for the target shape
const newSampler = new TextSampler('WORLD', font);
await newSampler.prepare();

// Morph particles to new shape (smooth animation)
await particles.morphTo(newSampler);
```

### Using Custom Meshes

```javascript
import { MeshSampler } from './src/index.js';

// Sample from any Three.js mesh
const meshSampler = new MeshSampler(myMesh);
await meshSampler.prepare();

await particles.setSource(meshSampler);
```

### Point Clouds

```javascript
import { PointCloudSampler } from './src/index.js';

// Create from array of positions
const points = new Float32Array([x1, y1, z1, x2, y2, z2, ...]);
const cloudSampler = new PointCloudSampler(points);
await cloudSampler.prepare();

await particles.setSource(cloudSampler);
```

## API

### GPGPUParticleSystem

Main class for the particle system.

```javascript
new GPGPUParticleSystem(renderer, options)
```

**Options:**
- `count` - Initial particle count (default: 1,000,000)
- `lod` - LOD configuration object
- `colorTexture` - Texture for particle coloring

**Methods:**
- `setSource(sampler)` - Set geometry source
- `morphTo(sampler)` - Smooth transition to new geometry
- `setParticleCount(count)` - Change particle count
- `setPointer(position, startPosition)` - Update pointer for interaction
- `update(deltaTime)` - Update simulation (call every frame)
- `dispose()` - Clean up resources

### Samplers

All samplers implement the same interface:

- `prepare()` - Async initialization
- `sample(count)` - Generate position data
- `getBoundingBox()` - Get geometry bounds
- `dispose()` - Clean up resources

## URL Parameters

- `?text=YOUR_TEXT` - Set initial text (URL encoded)

## Credits

Based on the original [one-million-particles](https://github.com/poeti8/one-million-particles) by [Pouria](https://pouria.dev).

## License

MIT
