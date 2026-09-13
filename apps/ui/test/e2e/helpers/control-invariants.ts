import { expect, type Locator } from '@playwright/test';

/** The CSS edge owns the perimeter; decorative SVG strokes must not paint it again. */
export async function expectSingleControlEdge(control: Locator) {
  const style = await control.evaluate(el => {
    const host = getComputedStyle(el);
    const fill = getComputedStyle(el, '::before');
    return {
      border: host.borderTopWidth,
      borderStyle: host.borderTopStyle,
      shadow: host.boxShadow,
      fillBorder: fill.borderTopWidth,
      fillWidth: fill.borderImageWidth,
      fillInset: fill.inset,
      fillOutset: fill.borderImageOutset,
      fillClip: fill.clipPath,
    };
  });
  expect(style.border).toBe('1px');
  expect(style.borderStyle).toBe('solid');
  expect(style.shadow).not.toContain('inset');
  expect(style.fillBorder).toBe('0px');
  expect(style.fillWidth).toBe('0');
  expect(style.fillInset).toBe('0px');
  expect(style.fillOutset).toBe('0');
  expect(style.fillClip).not.toBe('none');
}

/** Measure the actual composited artwork, including transparency and CSS filters.
 * A CSS background-color check misses SVGs painted on top of that background.
 * Hide only ink while capturing the surface, then restore the original DOM.
 * Sample inside the edge/corners, across the entire area that can contain text.
 */
export async function renderedControlContrast(control: Locator): Promise<number> {
  const page = control.page();
  const foreground = await control.evaluate(el => {
    const colors = [el, ...el.querySelectorAll('*')]
      .filter(node => [...node.childNodes].some(child => child.nodeType === Node.TEXT_NODE && child.textContent?.trim()))
      .map(node => getComputedStyle(node).color);
    return colors.length ? [...new Set(colors)] : [getComputedStyle(el).color];
  });
  await control.evaluate(el => el.setAttribute('data-vf-contrast-probe', ''));
  const hideInk = await page.addStyleTag({ content: `
    [data-vf-contrast-probe], [data-vf-contrast-probe] * {
      color: transparent !important;
      -webkit-text-fill-color: transparent !important;
      text-shadow: none !important;
    }
    [data-vf-contrast-probe] svg { visibility: hidden !important; }
  ` });
  let png: string;
  try {
    png = (await control.screenshot({ animations: 'disabled', scale: 'css' })).toString('base64');
  } finally {
    await hideInk.evaluate(el => el.remove());
    await control.evaluate(el => el.removeAttribute('data-vf-contrast-probe'));
  }
  return page.evaluate(async ({ image, colors }) => {
    const bytes = Uint8Array.from(atob(image), char => char.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable for rendered contrast');
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    function luminance(rgb: number[]) {
      const linear = rgb.map(value => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
    }
    const text = colors.map(color => {
      const channels = color.match(/[\d.]+/g)?.map(Number);
      if (!channels || channels.length < 3 || (channels[3] !== undefined && channels[3] !== 1)) {
        throw new Error(`Unsupported foreground color: ${color}`);
      }
      return luminance(channels.slice(0, 3));
    });
    let minimum = Infinity;
    for (let y = 6; y < canvas.height - 6; y += 2) {
      for (let x = 14; x < canvas.width - 14; x += 2) {
        const offset = (y * canvas.width + x) * 4;
        const background = luminance([pixels[offset]!, pixels[offset + 1]!, pixels[offset + 2]!]);
        for (const ink of text) {
          minimum = Math.min(minimum, (Math.max(ink, background) + 0.05) / (Math.min(ink, background) + 0.05));
        }
      }
    }
    if (!Number.isFinite(minimum)) throw new Error('No interior contrast samples');
    return minimum;
  }, { image: png, colors: foreground });
}
