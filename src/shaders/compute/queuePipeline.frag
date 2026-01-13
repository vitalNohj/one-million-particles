/**
 * Queue-Aware Pipeline Shader
 * 
 * This shader supports operation queues - each particle can have a sequence
 * of operations stored in the operation queue texture. The shader reads the
 * current operation from the queue, executes it, and advances to the next.
 */

precision highp float;

// Texture samplers
uniform sampler2D uPositionsTexture;
uniform sampler2D uVelocitiesTexture;
uniform sampler2D uOriginalPositionsTexture;
uniform sampler2D uOperationQueueTexture;  // R=currentIndex, G=op1, B=op2, A=op3

// Resolution and time
uniform vec2 uTextureResolution;
uniform float uTime;
uniform float uDeltaTime;

// Whether to use queue (0 = use global/per-particle op, 1 = use queue)
uniform float uUseQueue;

// Global operation override
uniform float uGlobalOperation;

// Operation parameters
uniform vec3 uGravity;
uniform vec3 uWindDirection;
uniform float uWindStrength;
uniform float uNoiseFrequency;
uniform float uNoiseAmplitude;
uniform vec3 uAttractorPosition;
uniform float uAttractorStrength;
uniform float uAttractorRadius;
uniform vec3 uPointer;
uniform vec3 uPointerStart;
uniform float uPointerRadius;
uniform float uPointerStrength;
uniform float uReturnHomeStrength;
uniform vec3 uVortexCenter;
uniform vec3 uVortexAxis;
uniform float uVortexStrength;
uniform float uVortexRadius;
uniform float uDamping;
uniform float uMaxSpeed;

// Queue size (how many operations in the queue)
uniform float uQueueSize;

// Include noise functions
#include "../includes/noise.glsl"

// Include operation implementations
#include "../includes/operations.glsl"

void main() {
    vec2 uv = gl_FragCoord.xy / uTextureResolution;
    
    // Read current state
    vec4 posData = texture2D(uPositionsTexture, uv);
    vec4 velData = texture2D(uVelocitiesTexture, uv);
    vec3 originalPos = texture2D(uOriginalPositionsTexture, uv).rgb;
    
    vec3 position = posData.rgb;
    vec3 velocity = velData.rgb;
    float opCodeFromPos = posData.a;
    float particleState = velData.a;
    
    // Determine operation code
    float opCode = opCodeFromPos;
    float nextOpCode = opCode;
    float queueIndex = 0.0;
    
    // If using queue, read from queue texture
    if (uUseQueue > 0.5) {
        vec4 queueData = texture2D(uOperationQueueTexture, uv);
        queueIndex = queueData.r;
        
        // Get operation at current index (stored in G, B, A channels)
        int idx = int(mod(queueIndex, 3.0));
        if (idx == 0) opCode = queueData.g;
        else if (idx == 1) opCode = queueData.b;
        else opCode = queueData.a;
        
        // Calculate next index (wrap around based on queue size)
        float qSize = max(uQueueSize, 1.0);
        queueIndex = mod(queueIndex + 1.0, min(qSize, 3.0));
    }
    
    // Global operation override
    if (uGlobalOperation > 0.0) {
        opCode = uGlobalOperation;
    }
    
    // Check particle state
    if (particleState == STATE_DEAD) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, opCode);
        return;
    }
    
    if (particleState == STATE_SPAWNING) {
        position = originalPos;
        velocity = vec3(0.0);
    }
    
    // Execute operation based on code
    if (opCode == OP_GRAVITY) {
        velocity = opGravity(velocity, normalize(uGravity), length(uGravity), uDeltaTime);
    }
    else if (opCode == OP_WIND) {
        velocity = opWind(velocity, uWindDirection, uWindStrength, uDeltaTime);
    }
    else if (opCode == OP_NOISE) {
        position = opNoise(position, uTime, uNoiseFrequency, uNoiseAmplitude);
    }
    else if (opCode == OP_ATTRACTOR) {
        velocity = opAttractor(position, velocity, uAttractorPosition, 
                               uAttractorStrength, uAttractorRadius, uDeltaTime);
    }
    else if (opCode == OP_RETURN_HOME) {
        velocity = opReturnHome(position, velocity, originalPos, uReturnHomeStrength);
    }
    else if (opCode == OP_POINTER) {
        velocity = opPointer(position, velocity, uPointer, uPointerStart, 
                            uPointerRadius, uPointerStrength);
    }
    else if (opCode == OP_TURBULENCE) {
        position = opTurbulence(position, uTime, uNoiseFrequency, uNoiseAmplitude, 3);
    }
    else if (opCode == OP_VORTEX) {
        velocity = opVortex(position, velocity, uVortexCenter, uVortexAxis, 
                           uVortexStrength, uVortexRadius, uDeltaTime);
    }
    else if (opCode == OP_ALL) {
        // Combined operations
        vec3 target = originalPos;
        
        // Pointer interaction
        vec3 diffToPointer = position - uPointer;
        float pointerDiffLength = distance(uPointer, uPointerStart);
        float distanceToPointer = length(position.xy - uPointer.xy);
        float isHit = 1.0 - smoothstep(0.0, uPointerRadius, distanceToPointer);
        vec3 pointerOffset = normalize(diffToPointer) * clamp(pow(2.5, pointerDiffLength * 4.0), 1.0, 100.0) * isHit;
        target += pointerOffset;
        
        // Attractor
        float distToAttractor = distance(position, uAttractorPosition);
        if (distToAttractor < uAttractorRadius && uAttractorRadius > 0.0) {
            vec3 dirToAttractor = normalize(uAttractorPosition - position);
            float pct = 1.0 - smoothstep(0.0, uAttractorRadius, distToAttractor);
            target += dirToAttractor * uAttractorStrength * pct;
        }
        
        // Gravity
        target += uGravity;
        
        velocity = target - position;
        position += curlNoise(originalPos + uTime * uNoiseFrequency) * uNoiseAmplitude;
    }
    
    // Apply damping
    if (uDamping > 0.0 && uDamping < 1.0) {
        velocity = opDamping(velocity, uDamping);
    }
    
    // Apply velocity
    position = applyVelocity(position, velocity, uDeltaTime, uMaxSpeed > 0.0 ? uMaxSpeed : 100.0);
    
    // Output: position + next operation code (or same if not using queue)
    gl_FragColor = vec4(position, opCode);
}
