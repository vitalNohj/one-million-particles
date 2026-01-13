/**
 * Self-Directing Pipeline Shader
 * 
 * This unified compute shader reads operation codes from the texture itself
 * and executes the corresponding math. The GPU runs autonomously - it reads
 * what operation to perform from the particle's data, executes it, and writes
 * the result back.
 * 
 * The CPU only needs to trigger the render; the shader decides what math to run
 * based on the operation code stored in each particle's texture data.
 */

precision highp float;

// Texture samplers
uniform sampler2D uPositionsTexture;      // Current positions (RGB) + operation code (A)
uniform sampler2D uVelocitiesTexture;     // Current velocities (RGB) + particle state (A)
uniform sampler2D uOriginalPositionsTexture; // Original/target positions
uniform sampler2D uOperationQueueTexture; // Optional: operation queue per particle

// Resolution and time
uniform vec2 uTextureResolution;
uniform float uTime;
uniform float uDeltaTime;

// Global operation override (if > 0, applies to all particles)
uniform float uGlobalOperation;

// Operation parameters - set by CPU
uniform vec3 uGravity;              // Gravity direction * strength
uniform vec3 uWindDirection;        // Wind direction
uniform float uWindStrength;        // Wind strength
uniform float uNoiseFrequency;      // Noise frequency
uniform float uNoiseAmplitude;      // Noise amplitude
uniform vec3 uAttractorPosition;    // Attractor position
uniform float uAttractorStrength;   // Attractor strength (negative = repel)
uniform float uAttractorRadius;     // Attractor influence radius
uniform vec3 uPointer;              // Current pointer position
uniform vec3 uPointerStart;         // Pointer start position (for drag calculation)
uniform float uPointerRadius;       // Pointer influence radius
uniform float uPointerStrength;     // Pointer push strength
uniform float uReturnHomeStrength;  // Spring back strength
uniform vec3 uVortexCenter;         // Vortex center
uniform vec3 uVortexAxis;           // Vortex rotation axis
uniform float uVortexStrength;      // Vortex strength
uniform float uVortexRadius;        // Vortex radius
uniform float uDamping;             // Velocity damping (0-1)
uniform float uMaxSpeed;            // Maximum particle speed

// Include noise functions
#include "../includes/noise.glsl"

// Include operation implementations
#include "../includes/operations.glsl"

void main() {
    vec2 uv = gl_FragCoord.xy / uTextureResolution;
    
    // ========================================
    // 1. READ CURRENT STATE FROM TEXTURES
    // ========================================
    vec4 posData = texture2D(uPositionsTexture, uv);
    vec4 velData = texture2D(uVelocitiesTexture, uv);
    vec3 originalPos = texture2D(uOriginalPositionsTexture, uv).rgb;
    
    vec3 position = posData.rgb;
    vec3 velocity = velData.rgb;
    float opCode = posData.a;           // Operation code stored in position alpha
    float particleState = velData.a;    // Particle lifecycle state in velocity alpha
    
    // Use global operation override if set
    if (uGlobalOperation > 0.0) {
        opCode = uGlobalOperation;
    }
    
    // ========================================
    // 2. CHECK PARTICLE LIFECYCLE STATE
    // ========================================
    
    // Dead particles - skip processing
    if (particleState == STATE_DEAD) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, opCode);
        return;
    }
    
    // Spawning particles - initialize to original position
    if (particleState == STATE_SPAWNING) {
        position = originalPos;
        velocity = vec3(0.0);
        particleState = STATE_ACTIVE;
    }
    
    // ========================================
    // 3. BRANCH AND EXECUTE OPERATION
    // ========================================
    
    // Apply operation based on code read from texture
    if (opCode == OP_GRAVITY) {
        // Apply gravity force
        velocity = opGravity(velocity, normalize(uGravity), length(uGravity), uDeltaTime);
    }
    else if (opCode == OP_WIND) {
        // Apply wind force
        velocity = opWind(velocity, uWindDirection, uWindStrength, uDeltaTime);
    }
    else if (opCode == OP_NOISE) {
        // Apply curl noise displacement
        position = opNoise(position, uTime, uNoiseFrequency, uNoiseAmplitude);
    }
    else if (opCode == OP_ATTRACTOR) {
        // Apply attractor force
        velocity = opAttractor(position, velocity, uAttractorPosition, 
                               uAttractorStrength, uAttractorRadius, uDeltaTime);
    }
    else if (opCode == OP_RETURN_HOME) {
        // Spring back to original position
        velocity = opReturnHome(position, velocity, originalPos, uReturnHomeStrength);
    }
    else if (opCode == OP_POINTER) {
        // Pointer interaction (repel from mouse)
        velocity = opPointer(position, velocity, uPointer, uPointerStart, 
                            uPointerRadius, uPointerStrength);
    }
    else if (opCode == OP_TURBULENCE) {
        // Multi-octave turbulence
        position = opTurbulence(position, uTime, uNoiseFrequency, uNoiseAmplitude, 3);
    }
    else if (opCode == OP_VORTEX) {
        // Vortex/swirl effect
        velocity = opVortex(position, velocity, uVortexCenter, uVortexAxis, 
                           uVortexStrength, uVortexRadius, uDeltaTime);
    }
    else if (opCode == OP_ALL) {
        // Combined operations (default behavior - similar to original shaders)
        
        // Calculate displacement for return-home behavior
        vec3 target = originalPos;
        
        // Pointer interaction (repel)
        vec3 diffToPointer = position - uPointer;
        float pointerDiffLength = distance(uPointer, uPointerStart);
        float distanceToPointer = length(position.xy - uPointer.xy);
        float isHit = 1.0 - smoothstep(0.0, uPointerRadius, distanceToPointer);
        vec3 pointerOffset = normalize(diffToPointer) * clamp(pow(2.5, pointerDiffLength * 4.0), 1.0, 100.0) * isHit;
        target += pointerOffset;
        
        // Attractor force
        float distToAttractor = distance(position, uAttractorPosition);
        if (distToAttractor < uAttractorRadius && uAttractorRadius > 0.0) {
            vec3 dirToAttractor = normalize(uAttractorPosition - position);
            float pct = 1.0 - smoothstep(0.0, uAttractorRadius, distToAttractor);
            target += dirToAttractor * uAttractorStrength * pct;
        }
        
        // Gravity
        target += uGravity;
        
        // Update velocity toward target
        velocity = target - position;
        
        // Apply noise
        position += curlNoise(originalPos + uTime * uNoiseFrequency) * uNoiseAmplitude;
    }
    // OP_NONE (0.0) or unknown - do nothing
    
    // ========================================
    // 4. APPLY VELOCITY AND DAMPING
    // ========================================
    
    // Apply damping
    if (uDamping > 0.0 && uDamping < 1.0) {
        velocity = opDamping(velocity, uDamping);
    }
    
    // Apply velocity to position
    position = applyVelocity(position, velocity, uDeltaTime, uMaxSpeed > 0.0 ? uMaxSpeed : 100.0);
    
    // ========================================
    // 5. CALCULATE OUTPUT VALUES
    // ========================================
    
    // Calculate displacement from original (used for coloring/effects)
    float displacement = calcDisplacement(position, originalPos);
    
    // Determine next operation (default: same operation)
    // This can be modified to cycle through an operation queue
    float nextOp = opCode;
    
    // ========================================
    // 6. WRITE RESULTS BACK TO TEXTURE
    // ========================================
    
    // Output: position (RGB) + next operation code (A)
    gl_FragColor = vec4(position, nextOp);
}
