import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '../../src/components/primitives/Button';
import { Dialog } from '../../src/components/primitives/Dialog';
import { Input } from '../../src/components/primitives/Input';
import { Tabs } from '../../src/components/primitives/Tabs';

describe('Astryx compatibility adapters', () => {
  it('Button forwards activation and disabled state', () => {
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>Save</Button>);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(<Button onClick={onClick} disabled>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('Button preserves an explicit accessible name when visible text differs', () => {
    render(<Button aria-label="Toggle theme">Light</Button>);
    expect(screen.getByRole('button', { name: 'Toggle theme' })).toHaveTextContent('Light');
  });

  it('Tabs changes panels through Astryx selection and blocks disabled tabs', () => {
    const onValueChange = vi.fn();
    render(
      <Tabs
        onValueChange={onValueChange}
        items={[
          { value: 'account', label: 'Account', content: <p>Account panel</p> },
          { value: 'invites', label: 'Invites', content: <p>Invites panel</p> },
          { value: 'locked', label: 'Locked', content: <p>Locked panel</p>, disabled: true },
        ]}
      />,
    );

    expect(screen.getByRole('tab', { name: 'Account' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'Invites' }));
    expect(screen.getByText('Invites panel')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Invites' })).toHaveAttribute('aria-selected', 'true');
    expect(onValueChange).toHaveBeenLastCalledWith('invites');

    fireEvent.click(screen.getByRole('tab', { name: 'Locked' }));
    expect(screen.queryByText('Locked panel')).not.toBeInTheDocument();
    expect(screen.getByText('Invites panel')).toBeInTheDocument();
  });

  it('Dialog trigger preserves its existing click handler and opens', async () => {
    const triggerClick = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <Dialog
        trigger={<Button onClick={triggerClick}>Open dialog</Button>}
        title="Confirm action"
        onOpenChange={onOpenChange}
      >
        Dialog body
      </Dialog>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));
    expect(triggerClick).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(true);
    await waitFor(() => expect(document.querySelector('dialog')?.open).toBe(true));
  });

  it('Input forwards text changes and required/read-only semantics', () => {
    const onChange = vi.fn();
    const { rerender } = render(<Input label="Project name" required onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: /^Project name/ });

    expect(input).toBeRequired();
    fireEvent.change(input, { target: { value: 'demo' } });
    expect(onChange).toHaveBeenCalled();
    expect(input).toHaveValue('demo');

    rerender(<Input label="Project name" value="fixed" readOnly onChange={onChange} />);
    expect(screen.getByRole('textbox', { name: /^Project name/ })).toHaveValue('fixed');
    expect(screen.getByRole('textbox', { name: /^Project name/ })).toHaveAttribute('readonly');
  });
});
