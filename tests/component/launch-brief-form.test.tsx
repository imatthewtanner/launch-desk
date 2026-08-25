import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LaunchBriefForm } from '@/components/forms/launch-brief-form';

function futureDate(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 30);
  return date.toISOString().slice(0, 10);
}

describe('LaunchBriefForm', () => {
  it('labels all five inputs and submits a valid controlled brief', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<LaunchBriefForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Product brief'), 'Launch Atlas reporting.');
    await user.type(screen.getByLabelText('Audience'), 'Engineering managers');
    await user.clear(screen.getByLabelText('Launch date'));
    await user.type(screen.getByLabelText('Launch date'), futureDate());
    await user.type(screen.getByLabelText('Constraints'), 'Use a staged rollout.');

    expect(screen.getByLabelText('Assets')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Build launch plan' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        productBrief: 'Launch Atlas reporting.',
        audience: 'Engineering managers',
        constraints: 'Use a staged rollout.',
      }),
      [],
    );
  });

  it('shows an accessible summary for missing and invalid values', async () => {
    const user = userEvent.setup();
    render(<LaunchBriefForm onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText('Product brief'), 'A');
    await user.clear(screen.getByLabelText('Launch date'));
    await user.type(screen.getByLabelText('Launch date'), '2020-01-01');
    await user.click(screen.getByRole('button', { name: 'Build launch plan' }));

    const summary = screen.getByRole('alert');
    expect(summary).toHaveTextContent(/audience is required/i);
    expect(summary).toHaveTextContent(/today or in the future/i);
  });

  it('supports file input and drop, rejects bad MIME, and removes a selected file', async () => {
    const user = userEvent.setup();
    render(<LaunchBriefForm onSubmit={vi.fn()} />);
    const input = screen.getByLabelText('Assets');
    const textFile = new File(['brief'], 'brief.md', { type: 'text/markdown' });
    const imageFile = new File(['image'], 'screen.png', { type: 'image/png' });

    await user.upload(input, textFile);
    fireEvent.drop(screen.getByTestId('asset-dropzone'), {
      dataTransfer: { files: [imageFile] },
    });

    expect(screen.getByText('brief.md')).toBeInTheDocument();
    expect(screen.getByText('screen.png')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove brief.md' }));
    expect(screen.queryByText('brief.md')).not.toBeInTheDocument();

    const executable = new File(['bad'], 'launch.exe', {
      type: 'application/x-msdownload',
    });
    fireEvent.change(input, { target: { files: [executable] } });
    expect(screen.getByRole('alert')).toHaveTextContent(/not supported/i);
  });

  it('reports oversized files and disables submission while uploads are running', async () => {
    const user = userEvent.setup();
    const large = new File(['x'], 'huge.pdf', { type: 'application/pdf' });
    Object.defineProperty(large, 'size', { value: 21 * 1024 * 1024 });
    const { rerender } = render(<LaunchBriefForm onSubmit={vi.fn()} />);

    await user.upload(screen.getByLabelText('Assets'), large);
    expect(screen.getByRole('alert')).toHaveTextContent(/20 MB or smaller/i);

    rerender(<LaunchBriefForm onSubmit={vi.fn()} busy busyLabel="Uploading assets" />);
    const button = screen.getByRole('button', { name: 'Uploading assets' });
    expect(button).toBeDisabled();
    expect(within(button).getByText('Uploading assets')).toBeInTheDocument();
  });
});
