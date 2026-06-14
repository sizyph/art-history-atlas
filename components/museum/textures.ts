// Lightweight procedural surface textures, drawn on a 2D canvas and uploaded as
// THREE textures. No image files — keeps the museums licence-clean and fast,
// while giving each room a believable material (timber, concrete, honed stone).

import * as THREE from "three";

function canvas(size = 512): {
  cv: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  return { cv, ctx: cv.getContext("2d")! };
}

function finish(cv: HTMLCanvasElement, repeat: [number, number]): THREE.Texture {
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, ((n >> 16) & 255) * f));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 255) * f));
  const b = Math.min(255, Math.max(0, (n & 255) * f));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// Planked wood — used for parquet floors, timber walls and pale boards.
export function makeWood(
  base: string,
  opts: { planks?: number; vertical?: boolean; repeat?: [number, number] } = {},
): THREE.Texture {
  const { cv, ctx } = canvas(512);
  const planks = opts.planks ?? 6;
  const W = 512;
  const step = W / planks;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, W);

  for (let p = 0; p < planks; p++) {
    const x0 = p * step;
    const tone = 0.86 + ((p * 37) % 7) / 24; // deterministic per-plank variation
    ctx.fillStyle = shade(base, tone);
    ctx.fillRect(x0, 0, step, W);
    // grain streaks
    for (let g = 0; g < 26; g++) {
      const gx = x0 + ((g * 53) % step);
      ctx.strokeStyle = shade(base, tone * (0.9 + ((g * 13) % 5) / 40));
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let y = 0; y <= W; y += 16) {
        const wob = Math.sin((y + p * 90) / 60 + g) * 3;
        if (y === 0) ctx.moveTo(gx + wob, y);
        else ctx.lineTo(gx + wob, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // seam shadow
    ctx.strokeStyle = shade(base, 0.55);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    ctx.lineTo(x0, W);
    ctx.stroke();
  }

  const cvFinal = opts.vertical ? rotate90(cv) : cv;
  return finish(cvFinal, opts.repeat ?? [6, 6]);
}

function rotate90(src: HTMLCanvasElement): HTMLCanvasElement {
  const { cv, ctx } = canvas(src.width);
  ctx.translate(src.width / 2, src.height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return cv;
}

// Board-formed concrete — flat mottling with horizontal form seams + tie holes.
export function makeConcrete(
  base: string,
  repeat: [number, number] = [3, 3],
): THREE.Texture {
  const { cv, ctx } = canvas(512);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);
  // mottle
  for (let i = 0; i < 900; i++) {
    const x = (i * 131) % 512;
    const y = (i * 217) % 512;
    const r = 4 + ((i * 7) % 40);
    ctx.globalAlpha = 0.04;
    ctx.fillStyle = shade(base, i % 2 ? 1.18 : 0.82);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // form-board seams
  for (let b = 0; b <= 4; b++) {
    const y = (b * 512) / 4;
    ctx.strokeStyle = shade(base, 0.7);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
    // tie-rod holes along the seam
    for (let h = 0; h < 4; h++) {
      const x = 64 + h * 128;
      ctx.fillStyle = shade(base, 0.5);
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return finish(cv, repeat);
}

// Honed stone — soft value drift with fine speckle and an occasional vein.
export function makeStone(
  base: string,
  repeat: [number, number] = [4, 4],
): THREE.Texture {
  const { cv, ctx } = canvas(512);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 6; i++) {
    const g = ctx.createRadialGradient(
      (i * 97) % 512,
      (i * 173) % 512,
      10,
      (i * 97) % 512,
      (i * 173) % 512,
      200,
    );
    g.addColorStop(0, shade(base, i % 2 ? 1.1 : 0.9));
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
  }
  ctx.globalAlpha = 1;
  // speckle
  for (let i = 0; i < 2400; i++) {
    const x = (i * 263) % 512;
    const y = (i * 521) % 512;
    ctx.fillStyle = shade(base, i % 3 ? 1.12 : 0.84);
    ctx.globalAlpha = 0.12;
    ctx.fillRect(x, y, 1.4, 1.4);
  }
  ctx.globalAlpha = 1;
  return finish(cv, repeat);
}
