import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '../../src/components/primitives/Button';
import { Tabs } from '../../src/components/primitives/Tabs';

const items = [
  { value: 'account', label: 'Account', content: <p>Account settings</p> },
  { value: 'models', label: 'Models', content: <p>Model settings</p> },
];

describe('Visible shared controls', () => {
  it('uses composed visible text as the accessible name and ignores decorative children', () => {
    const variant = 'primary';
    const size = 'sm';
    render(<><Button>{variant} {size}</Button><Button><span aria-hidden="true">+</span>Save <strong>3</strong> changes</Button></>);
    expect(screen.getByRole('button', { name: 'primary sm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save 3 changes' })).toBeInTheDocument();
  });

  it('publishes stable styling hooks without losing its accessible name, type, icons or activation', () => {
    const onClick = vi.fn();
    render(<Button variant="outline" size="sm" type="button" title="Save settings" leftIcon={<span data-testid="icon" />} onClick={onClick}>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save settings' });
    expect(button).toHaveClass('vf-button');
    expect(button).toHaveAttribute('data-vf-variant', 'outline');
    expect(button).toHaveAttribute('data-vf-size', 'sm');
    expect(button).toHaveAttribute('type', 'button');
    expect(screen.getByTestId('icon')).toBeInTheDocument();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('keeps loading buttons disabled rather than only changing their appearance', () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('associates every tab with a uniquely named panel, including when two instances coexist', () => {
    render(<><Tabs items={items} /><Tabs items={items} variant="segmented" /></>);
    const ids = screen.getAllByRole('tab').map(tab => tab.id);
    expect(new Set(ids).size).toBe(4);
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab).toHaveClass('vf-tab');
      const panel = document.getElementById(tab.getAttribute('aria-controls')!);
      expect(panel).not.toBeNull();
      expect(panel).toHaveAttribute('aria-labelledby', tab.id);
      expect(panel).toHaveAttribute('role', 'tabpanel');
    }
    expect(screen.getAllByRole('tabpanel')).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('tab', { name: 'Models' })[0]!);
    expect(screen.getByRole('tabpanel', { name: 'Models' })).toHaveTextContent('Model settings');
  });

  it('does not activate a controlled tab until its owner changes the value', () => {
    const onValueChange = vi.fn();
    const { rerender } = render(<Tabs items={items} value="account" onValueChange={onValueChange} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Models' }));
    expect(onValueChange).toHaveBeenCalledWith('models');
    expect(screen.getByRole('tabpanel', { name: 'Account' })).toBeVisible();
    rerender(<Tabs items={items} value="models" onValueChange={onValueChange} />);
    expect(screen.getByRole('tabpanel', { name: 'Models' })).toBeVisible();
  });
});
