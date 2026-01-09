// Simple fullscreen quad vertex shader for GPGPU passes

void main() {
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}

