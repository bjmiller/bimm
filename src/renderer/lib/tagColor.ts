import { generateColor, Arc4, Xor4096, Xorwow, type ColorOptions } from '@marko19907/string-to-color';

// Deterministic per-tag color, shared by the album list pills (`Genre`) and the
// tag editor pills (`RemovableTag`) so the same tag looks identical in both.

const LIGHTNESS_RANGE = 20;
const LIGHTNESS_FLOOR = 35;
const SATURATION_RANGE = 20;
const SATURATION_FLOOR = 65;
const ALPHA = 55;

export const tagBackgroundColor = (tag: string): string => {
  // Somewhere between 35 and 55.
  const lightness = Math.floor(Xorwow(tag) * LIGHTNESS_RANGE) + LIGHTNESS_FLOOR;
  // Somewhere between 65 and 85.
  const saturation = Math.floor(Arc4(tag) * SATURATION_RANGE) + SATURATION_FLOOR;
  const options: ColorOptions = { algorithm: Xor4096, lightness, saturation, alpha: ALPHA };

  return generateColor(tag, options);
};
