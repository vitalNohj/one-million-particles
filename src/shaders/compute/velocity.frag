precision highp float;

uniform sampler2D uOriginalPositionsTexture;
uniform sampler2D uPositionsTexture;
uniform sampler2D uVelocitiesTexture;
uniform vec2 uTextureResolution;
uniform vec3 uPointer;
uniform vec3 uPointerStart;

// New Uniforms
uniform vec3 uGravity;
uniform vec3 uAttractorPosition;
uniform float uAttractorStrength;
uniform float uAttractorRadius;

void main() {
  vec2 uv = gl_FragCoord.xy / uTextureResolution;
  
  // Sample current state
  vec3 originalPosition = texture2D(uOriginalPositionsTexture, uv).rgb;
  vec3 position = texture2D(uPositionsTexture, uv).rgb;
  vec4 velData = texture2D(uVelocitiesTexture, uv);
  vec3 velocity = velData.rgb;
  float particleState = velData.a;  // PRESERVE particle state from texture!

  // 1. Base Target (Original Position)
  vec3 target = originalPosition;

  // 2. Pointer Interaction (Repel)
  vec3 diffToPointer = position - uPointer;    
  float pointerDiffLength = distance(uPointer, uPointerStart);
  float distanceToPointer = length(position.xy - uPointer.xy);
  
  // Smooth falloff for pointer influence
  float isHit = 1.0 - smoothstep(0.0, 1.0, distanceToPointer);
  
  // Calculate pointer displacement (particles pushed away from pointer)
  vec3 pointerOffset = normalize(diffToPointer) * clamp(pow(2.5, pointerDiffLength * 4.0), 1.0, 100.0) * isHit;
  target += pointerOffset;
  
  // 3. Attractor Force (displaces target towards/away from attractor)
  float distToAttractor = distance(position, uAttractorPosition);
  if (distToAttractor < uAttractorRadius && uAttractorRadius > 0.0) {
    vec3 dirToAttractor = normalize(uAttractorPosition - position);
    float pct = 1.0 - smoothstep(0.0, uAttractorRadius, distToAttractor);
    target += dirToAttractor * uAttractorStrength * pct;
  }

  // 4. Gravity (displaces target)
  target += uGravity;

  // Update velocity to move toward target
  // This behaves like a damped spring system where particles seek the target
  velocity = target - position;

  // Output velocity with PRESERVED particle state in alpha
  gl_FragColor = vec4(velocity, particleState);
}
