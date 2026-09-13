import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EditableField } from './EditableField.js';

afterEach(cleanup);

describe('EditableField', () => {
  it('commits on Enter', () => {
    const onCommit = vi.fn();
    render(<EditableField value="old" onCommit={onCommit} ariaLabel="title" />);

    fireEvent.click(screen.getByRole('button', { name: 'title' }));
    const input = screen.getByLabelText('title') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'new' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('new');
  });

  it('commits on blur', () => {
    const onCommit = vi.fn();
    render(<EditableField value="old" onCommit={onCommit} ariaLabel="title" />);

    fireEvent.click(screen.getByRole('button', { name: 'title' }));
    const input = screen.getByLabelText('title');
    fireEvent.change(input, { target: { value: 'blurred' } });
    fireEvent.blur(input);

    expect(onCommit).toHaveBeenCalledWith('blurred');
  });

  it('cancels on Escape and restores the value', () => {
    const onCommit = vi.fn();
    render(<EditableField value="old" onCommit={onCommit} ariaLabel="title" />);

    fireEvent.click(screen.getByRole('button', { name: 'title' }));
    const input = screen.getByLabelText('title');
    fireEvent.change(input, { target: { value: 'discarded' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'title' }).textContent).toBe('old');
  });

  it('does not fire onCommit when nothing changed', () => {
    const onCommit = vi.fn();
    render(<EditableField value="same" onCommit={onCommit} ariaLabel="title" />);

    fireEvent.click(screen.getByRole('button', { name: 'title' }));
    fireEvent.keyDown(screen.getByLabelText('title'), { key: 'Enter' });

    expect(onCommit).not.toHaveBeenCalled();
  });

  it('keeps Enter as a newline in multiline mode and commits on Ctrl+Enter', () => {
    const onCommit = vi.fn();
    render(<EditableField multiline value="a" onCommit={onCommit} ariaLabel="summary" />);

    fireEvent.click(screen.getByRole('button', { name: 'summary' }));
    const area = screen.getByLabelText('summary');
    fireEvent.change(area, { target: { value: 'a\nb' } });
    fireEvent.keyDown(area, { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.keyDown(area, { key: 'Enter', ctrlKey: true });
    expect(onCommit).toHaveBeenCalledWith('a\nb');
  });
});
