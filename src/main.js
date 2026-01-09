/**
 * GPGPU Particle Playground - Main Application Entry
 */

import { PlaygroundApp } from './playground/PlaygroundApp.js';
import { UIControls } from './playground/UIControls.js';

// Parse URL parameters for initial text
function parseURLParameters() {
  const urlParams = new URLSearchParams(window.location.search);
  const textParam = urlParams.get('text');
  return textParam ? decodeURIComponent(textParam) : null;
}

// Initialize the application
async function init() {
  const canvas = document.querySelector('canvas');
  
  if (!canvas) {
    console.error('Canvas element not found');
    return;
  }

  // Get initial text from URL if provided
  const urlText = parseURLParameters();

  // Create playground app
  const app = new PlaygroundApp(canvas, {
    fontUrl: './assets/font.json',
    colorTextureUrl: './assets/watermarble.jpg',
    initialPreset: 'text'
  });

  // Create UI controls
  const ui = new UIControls(app);

  // Initialize app
  try {
    await app.init();
    
    // Create UI
    ui.create(document.body);

    // Apply URL text if provided
    if (urlText) {
      ui.setText(urlText);
      await app.updateText(urlText, false);
    }

    // Start render loop
    app.start();

    // Expose app to window for debugging/API access
    window.particleApp = app;
    window.updateParticleText = async (text, options = {}) => {
      const smooth = options.mode !== 'init';
      await app.updateText(text, smooth);
      ui.setText(text);
      
      if (options.particleCount) {
        await app.updateParticleCount(options.particleCount);
        ui.setParticleCount(options.particleCount);
      }
    };

    console.log('GPGPU Particle System initialized');
    console.log(`Particle count: ${app.getParticleCount().toLocaleString()}`);
    
  } catch (error) {
    console.error('Failed to initialize particle system:', error);
  }
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

