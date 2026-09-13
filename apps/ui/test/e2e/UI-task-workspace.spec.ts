import { expect, test, type Page } from '@playwright/test';
import { resetE2EState, waitForHydratedIsland } from './helpers/webauthn';

async function setup(page: Page) {
  await resetE2EState(page);
  expect((await page.request.post('/__e2e/session', { data: { role: 'owner' } })).ok()).toBe(true);
  for (const [name, task] of [
    ['@cf/test/e2e-image', 'text-to-image'], ['@cf/test/e2e-embedding', 'text-embeddings'],
    ['@cf/openai/whisper-large-v3-turbo', 'automatic-speech-recognition'],
    ['@cf/deepgram/nova-3', 'automatic-speech-recognition'], ['@cf/deepgram/flux', 'automatic-speech-recognition'],
  ]) expect((await page.request.post('/__e2e/seed-model', { data: { name, task, paid_required: false } })).ok()).toBe(true);
  await page.goto('/chat'); await waitForHydratedIsland(page, 'vibeflare-chat');
}

async function drop(page: Page, name: string, type: string, content: string) {
  const data = await page.evaluateHandle(({ name, type, content }) => {
    const transfer = new DataTransfer(); transfer.items.add(new File([content], name, { type })); return transfer;
  }, { name, type, content });
  await page.getByTestId('file-dropzone').dispatchEvent('dragenter', { dataTransfer: data });
  await expect(page.getByTestId('file-dropzone')).toHaveAttribute('data-dragging', 'true');
  await page.getByTestId('file-dropzone').dispatchEvent('drop', { dataTransfer: data });
  await data.dispose();
}

for (const theme of ['light', 'dark']) for (const width of [1440, 390, 320]) {
  test(`All task tabs keep the same layout at ${width}px in ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(theme => localStorage.setItem('vf-theme', theme), theme);
    await setup(page);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    const bounds: Array<{ x: number; y: number; width: number; height: number }> = [];
    const toolbars: Array<{ y: number; height: number }> = [];
    for (const tab of ['Text', 'Image', 'Embeddings', 'Audio', 'Text']) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      await expect(page.getByRole('tab', { name: tab, exact: true })).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByRole('combobox')).toBeVisible();
      await page.evaluate(async () => { await document.fonts.ready; document.querySelector('.vf-main')!.scrollTop = 0; });
      const input = await page.getByTestId('task-input').boundingBox(); expect(input).not.toBeNull(); bounds.push(input!);
      toolbars.push((await page.locator('.vf-chat-toolbar').boundingBox())!);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      const overflow = await page.getByTestId('task-workspace').evaluate(el => el.scrollWidth > el.clientWidth + 1); expect(overflow).toBe(false);
      await expect(page.getByTestId('file-dropzone')).toBeVisible();
      if (tab === 'Embeddings') {
        await expect(page.getByTestId('task-heading')).toContainText('find content by meaning');
        await expect(page.getByTestId('task-heading')).toContainText('not a chat reply');
        await expect(page.getByTestId('task-explanation')).toContainText('refund policy');
      }
      if (tab === 'Audio') {
        await expect(page.getByRole('combobox')).toContainText('@cf/openai/whisper-large-v3-turbo');
        await page.getByRole('combobox').click();
        await expect(page.getByRole('option', { name: '@cf/deepgram/flux', exact: true })).toHaveCount(0);
        await page.keyboard.press('Escape');
      }
      if (tab !== 'Text') await page.screenshot({ path: testInfo.outputPath(`${tab}-${theme}-${width}.png`), fullPage: true, animations: 'disabled' });
    }
    for (const bound of bounds.slice(1)) {
      expect(Math.abs(bound.x - bounds[0]!.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(bound.y - bounds[0]!.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(bound.width - bounds[0]!.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(bound.height - bounds[0]!.height)).toBeLessThanOrEqual(1);
    }
    for (const bar of toolbars.slice(1)) expect(Math.abs(bar.height - toolbars[0]!.height)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
}

for (const tab of ['Text', 'Image', 'Embeddings']) {
  test(`${tab} consumes dropped text as actual model input, without sending on drop`, async ({ page }) => {
    await setup(page); await page.getByRole('tab', { name: tab, exact: true }).click();
    const calls: { path: string; body: any }[] = [];
    page.on('request', req => { if (new URL(req.url()).pathname.startsWith('/v1/') && req.method() === 'POST') calls.push({ path: new URL(req.url()).pathname, body: req.postDataJSON() }); });
    await drop(page, 'brief.txt', 'text/plain', 'A small orange planet above a calm lake.');
    await expect(page.getByLabel('Message input')).toContainText('A small orange planet above a calm lake.');
    expect(calls).toHaveLength(0);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect.poll(() => calls.length).toBe(1);
    expect(calls[0]!.path).toBe(tab === 'Text' ? '/v1/chat/completions' : tab === 'Image' ? '/v1/images/generations' : '/v1/embeddings');
    const body = calls[0]!.body;
    expect(tab === 'Text' ? body.messages.at(-1).content : tab === 'Image' ? body.prompt : body.input).toContain('A small orange planet above a calm lake.');
    if (tab === 'Image') await expect(page.getByTestId('saved-media-result').locator('img')).toBeVisible();
    else if (tab === 'Embeddings') await expect(page.getByRole('link', { name: 'Download full embeddings (JSON)' })).toBeVisible();
    else await expect(page.getByText('Hello from VibeFlare E2E', { exact: true })).toBeVisible();
  });
}

test('Audio accepts dropped and browsed recordings; Nova and Whisper save normalized transcripts', async ({ page }) => {
  await setup(page); await page.getByRole('tab', { name: 'Audio', exact: true }).click();
  const requests: string[] = []; page.on('request', req => { if (req.url().includes('/v1/audio/transcriptions')) requests.push(req.url()); });
  await drop(page, 'voice.mp3', 'audio/mpeg', 'ID3-local-fixture');
  expect(requests).toHaveLength(0);
  await expect(page.getByRole('button', { name: 'Transcribe', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Transcribe', exact: true }).click();
  await expect(page.getByText('Whisper file transcription saved successfully.', { exact: true })).toBeVisible();
  await page.getByRole('combobox').click(); await page.getByRole('option', { name: '@cf/deepgram/nova-3', exact: true }).click();
  await page.getByLabel('Audio file', { exact: true }).setInputFiles({ name: 'second.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('ID3-second-fixture') });
  await page.getByRole('button', { name: 'Transcribe', exact: true }).click();
  await expect(page.getByText('Nova file transcription saved successfully.', { exact: true })).toBeVisible();
  expect(requests).toHaveLength(2);
  await page.reload();
  await expect(page.getByText('Nova file transcription saved successfully.', { exact: true })).toBeVisible();
  await expect(page.getByText('Whisper file transcription saved successfully.', { exact: true })).toBeVisible();
});

test('Invalid drops and readable errors do not clear a valid recording or invoke a model', async ({ page }) => {
  await setup(page); await page.getByRole('tab', { name: 'Audio', exact: true }).click();
  await drop(page, 'bad.txt', 'text/plain', 'Not audio');
  await expect(page.getByRole('alert')).toContainText('not supported');
  await expect(page.getByRole('button', { name: 'Transcribe', exact: true })).toBeDisabled();
  await drop(page, 'valid.mp3', 'audio/mpeg', 'ID3-test');
  await page.route('**/v1/audio/transcriptions*', route => route.fulfill({ status: 503, json: { error: { type: 'server_error', message: 'The audio service is busy. Please try again.' } } }));
  await page.getByRole('button', { name: 'Transcribe', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('The audio service is busy. Please try again.');
  await expect(page.getByRole('button', { name: 'Transcribe', exact: true })).toBeEnabled();
  await page.unroute('**/v1/audio/transcriptions*');
  await page.getByRole('button', { name: 'Transcribe', exact: true }).click();
  await expect(page.getByText('Whisper file transcription saved successfully.', { exact: true })).toBeVisible();
});
