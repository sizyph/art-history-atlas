"use client";

// A radial "peripheral vision" blur: the centre of the frame stays perfectly
// sharp and the blur grows toward the corners, like the soft edge of a gaze.
// Pairs with a gentle depth-of-field so the centre subject reads crisply while
// the surroundings fall away.

import { Effect } from "postprocessing";
import { Uniform } from "three";
import { wrapEffect } from "@react-three/postprocessing";

const fragmentShader = /* glsl */ `
uniform float intensity;
uniform float innerRadius;
uniform float outerRadius;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  float asp = resolution.x / resolution.y;
  vec2 c = (uv - 0.5) * vec2(asp, 1.0);
  float t = smoothstep(innerRadius, outerRadius, length(c));
  if (t < 0.003) {
    outputColor = inputColor;
    return;
  }
  // stronger toward the corners
  vec2 px = texelSize * (t * t * intensity);
  vec4 sum = inputColor;
  sum += texture2D(inputBuffer, uv + px * vec2( 1.0,  0.0));
  sum += texture2D(inputBuffer, uv + px * vec2(-1.0,  0.0));
  sum += texture2D(inputBuffer, uv + px * vec2( 0.0,  1.0));
  sum += texture2D(inputBuffer, uv + px * vec2( 0.0, -1.0));
  sum += texture2D(inputBuffer, uv + px * vec2( 0.7,  0.7));
  sum += texture2D(inputBuffer, uv + px * vec2(-0.7,  0.7));
  sum += texture2D(inputBuffer, uv + px * vec2( 0.7, -0.7));
  sum += texture2D(inputBuffer, uv + px * vec2(-0.7, -0.7));
  sum /= 9.0;
  outputColor = mix(inputColor, sum, t);
}
`;

class PeripheralBlurEffectImpl extends Effect {
  constructor({
    intensity = 7,
    innerRadius = 0.24,
    outerRadius = 0.62,
  }: {
    intensity?: number;
    innerRadius?: number;
    outerRadius?: number;
  } = {}) {
    super("PeripheralBlur", fragmentShader, {
      uniforms: new Map<string, Uniform<number>>([
        ["intensity", new Uniform(intensity)],
        ["innerRadius", new Uniform(innerRadius)],
        ["outerRadius", new Uniform(outerRadius)],
      ]),
    });
  }
}

export const PeripheralBlur = wrapEffect(PeripheralBlurEffectImpl);
