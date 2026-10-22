// Original 5×7 bitmap glyphs for the game's canvas popups.
const GLYPHS: Record<string, readonly string[]> = {
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  N: ['10001', '11001', '11001', '10101', '10011', '10011', '10001'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
};

/** Draw centered text above a baseline using solid, integer-sized pixels.
 * The caller controls fill color and opacity, just like canvas fillText.
 */
export function drawPixelText(
  ctx: CanvasRenderingContext2D, text: string, x: number, baseline: number, scale = 3,
): void {
  const left = Math.round(x - (text.length * 6 - 1) * scale / 2);
  const top = Math.round(baseline - 7 * scale);
  for (const [index, character] of [...text].entries()) {
    const glyph = GLYPHS[character];
    if (!glyph) continue;
    glyph.forEach((row, y) => {
      for (let column = 0; column < row.length; column++) {
        if (row[column] === '1') {
          ctx.fillRect(left + (index * 6 + column) * scale, top + y * scale, scale, scale);
        }
      }
    });
  }
}
