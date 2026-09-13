import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FileDropzone } from '../../src/components/widgets/FileDropzone';
import { readPromptFile } from '../../src/lib/file-input';
import { uploadFile } from '../../src/lib/api';
vi.mock('../../src/lib/api', () => ({ uploadFile: vi.fn(async (file: File) => ({ id: 'f1', name: file.name, mime: file.type, size: file.size, created_at: 'now' })) }));

const text = () => new File(['Text that reaches the model'], 'notes.txt', { type: 'text/plain' });
describe('reusable file drop and browse input', () => {
  it('delivers the actual dropped file to a task without uploading it behind the scenes', async () => {
    const onFiles = vi.fn(); render(<FileDropzone onFiles={onFiles} accept=".txt" label="Import text" />);
    const file = text();
    fireEvent.drop(screen.getByTestId('file-dropzone'), { dataTransfer: { files: [file] } });
    await waitFor(() => expect(onFiles).toHaveBeenCalledWith([file]));
    expect(uploadFile).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('notes.txt')).toBeVisible());
  });
  it('validates drop and browse identically and leaves invalid input out of the task', async () => {
    const onFiles = vi.fn(); render(<FileDropzone onFiles={onFiles} accept=".txt" hint="Text files only" maxBytes={32} />);
    const png = new File(['x'], 'photo.png', { type: 'image/png' });
    fireEvent.drop(screen.getByTestId('file-dropzone'), { dataTransfer: { files: [png] } });
    expect(screen.getByRole('alert')).toHaveTextContent('not supported');
    fireEvent.change(screen.getByTestId('file-upload-input'), { target: { files: [png] } });
    expect(onFiles).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId('file-upload-input'), { target: { files: [new File(['x'.repeat(33)], 'large.txt')] } });
    expect(screen.getByRole('alert')).toHaveTextContent('too large');
    expect(onFiles).not.toHaveBeenCalled();
  });
  it('accepts browse input, supports a real keyboard button, and rejects duplicate work', async () => {
    let release!: () => void;
    const onFiles = vi.fn(() => new Promise<void>(resolve => { release = resolve; }));
    render(<FileDropzone onFiles={onFiles} label="Audio file" />);
    expect(screen.getByRole('button', { name: 'Browse: Audio file' }).tagName).toBe('BUTTON');
    fireEvent.change(screen.getByTestId('file-upload-input'), { target: { files: [text()] } });
    await waitFor(() => expect(onFiles).toHaveBeenCalledTimes(1));
    fireEvent.drop(screen.getByTestId('file-dropzone'), { dataTransfer: { files: [text()] } });
    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button')).toBeDisabled();
    release();
    await waitFor(() => expect(screen.getByRole('button')).not.toBeDisabled());
  });
  it('preserves ordinary Files-page upload behavior', async () => {
    const onUploaded = vi.fn(); render(<FileDropzone onUploaded={onUploaded} />);
    fireEvent.change(screen.getByTestId('file-upload-input'), { target: { files: [text()] } });
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(expect.objectContaining({ name: 'notes.txt', id: 'f1' })));
  });
});

describe('text-file imports', () => {
  it('reads UTF-8 as real prompt content', async () => {
    expect(await readPromptFile(text())).toBe('Text that reaches the model');
  });
  it('rejects empty, binary, oversized and unsupported files instead of pretending to read them', async () => {
    for (const file of [new File([], 'empty.txt'), new File(['\0bad'], 'binary.txt'), new File(['x'.repeat(65537)], 'large.txt'), new File(['pdf'], 'notes.pdf')]) {
      await expect(readPromptFile(file)).rejects.toThrow();
    }
  });
});
