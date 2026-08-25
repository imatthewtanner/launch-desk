'use client';

import { Rocket } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';

import { AssetDropzone } from '@/components/forms/asset-dropzone';
import {
  LaunchRequestSchema,
  type LaunchRequest,
} from '@/lib/contracts/launch';

export type LaunchBriefSubmission = Omit<LaunchRequest, 'assets'>;

interface LaunchBriefFormProps {
  onSubmit(launch: LaunchBriefSubmission, files: File[]): void | Promise<void>;
  busy?: boolean;
  busyLabel?: string;
  externalError?: string | null;
  initialValues?: Partial<LaunchBriefSubmission>;
}

function defaultLaunchDate(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 30);
  return date.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function LaunchBriefForm({
  onSubmit,
  busy = false,
  busyLabel = 'Building launch plan',
  externalError = null,
  initialValues = {},
}: LaunchBriefFormProps) {
  const [productBrief, setProductBrief] = useState(initialValues.productBrief ?? '');
  const [audience, setAudience] = useState(initialValues.audience ?? '');
  const [launchDate, setLaunchDate] = useState(
    initialValues.launchDate ?? defaultLaunchDate(),
  );
  const [constraints, setConstraints] = useState(initialValues.constraints ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const errorMessages = useMemo(
    () => (externalError ? [...errors, externalError] : errors),
    [errors, externalError],
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = LaunchRequestSchema.safeParse({
      title: initialValues.title,
      productBrief,
      audience,
      launchDate,
      constraints,
      assets: [],
    });

    if (!parsed.success) {
      const messages = parsed.error.issues.map((issue) => issue.message);
      setErrors([...new Set(messages)]);
      return;
    }

    setErrors([]);
    const launch: LaunchBriefSubmission = {
      title: parsed.data.title,
      productBrief: parsed.data.productBrief,
      audience: parsed.data.audience,
      launchDate: parsed.data.launchDate,
      constraints: parsed.data.constraints,
    };
    void onSubmit(launch, files);
  }

  return (
    <form className="launch-form" noValidate onSubmit={submit}>
      {errorMessages.length > 0 ? (
        <div className="form-error-summary" role="alert" aria-label="Please fix the form">
          <strong>Please check the launch details.</strong>
          <ul>
            {errorMessages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="field-stack">
        <label className="field-label" htmlFor="product-brief">
          Product brief
        </label>
        <textarea
          id="product-brief"
          value={productBrief}
          rows={5}
          maxLength={12_000}
          placeholder="What are you launching, and what should change for customers?"
          disabled={busy}
          onChange={(event) => setProductBrief(event.target.value)}
        />
      </div>

      <div className="field-stack">
        <label className="field-label" htmlFor="audience">
          Audience
        </label>
        <input
          id="audience"
          value={audience}
          maxLength={2_000}
          placeholder="Engineering managers"
          disabled={busy}
          onChange={(event) => setAudience(event.target.value)}
        />
      </div>

      <div className="field-stack">
        <label className="field-label" htmlFor="launch-date">
          Launch date
        </label>
        <input
          id="launch-date"
          type="date"
          min={today()}
          value={launchDate}
          disabled={busy}
          onChange={(event) => setLaunchDate(event.target.value)}
        />
      </div>

      <div className="field-stack">
        <label className="field-label" htmlFor="constraints">
          Constraints
        </label>
        <textarea
          id="constraints"
          value={constraints}
          rows={4}
          maxLength={4_000}
          placeholder="Rollout, compliance, staffing, dependencies, or no-downtime requirements"
          disabled={busy}
          onChange={(event) => setConstraints(event.target.value)}
        />
      </div>

      <AssetDropzone files={files} onFilesChange={setFiles} disabled={busy} />

      <button className="primary-button" type="submit" disabled={busy}>
        <Rocket aria-hidden="true" size={18} strokeWidth={1.8} />
        <span>{busy ? busyLabel : 'Build launch plan'}</span>
      </button>
    </form>
  );
}
