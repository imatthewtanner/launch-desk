'use client';

import { FileText, UploadCloud, X } from 'lucide-react';
import { useId, useState } from 'react';

import {
  MAX_ASSETS,
  MAX_ASSET_BYTES,
  SUPPORTED_ASSET_MIME_TYPES,
} from '@/lib/contracts/launch';

interface AssetDropzoneProps {
  files: File[];
  onFilesChange(files: File[]): void;
  disabled?: boolean;
}

const allowedTypes = new Set<string>(SUPPORTED_ASSET_MIME_TYPES);

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.type}`;
}

export function AssetDropzone({
  files,
  onFilesChange,
  disabled = false,
}: AssetDropzoneProps) {
  const inputId = useId();
  const [message, setMessage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function addFiles(incoming: File[]) {
    setMessage(null);
    if (files.length + incoming.length > MAX_ASSETS) {
      setMessage(`A launch can include at most ${MAX_ASSETS} assets.`);
      return;
    }

    const invalidType = incoming.find((file) => !allowedTypes.has(file.type));
    if (invalidType) {
      setMessage(`“${invalidType.name}” is not supported.`);
      return;
    }
    const oversized = incoming.find((file) => file.size > MAX_ASSET_BYTES);
    if (oversized) {
      setMessage(`“${oversized.name}” must be 20 MB or smaller.`);
      return;
    }

    const existing = new Set(files.map(fileKey));
    const next = [...files];
    for (const file of incoming) {
      if (!existing.has(fileKey(file))) {
        existing.add(fileKey(file));
        next.push(file);
      }
    }
    onFilesChange(next);
  }

  return (
    <div className="asset-field">
      <label className="field-label" htmlFor={inputId}>
        Assets
      </label>
      <label
        className={`asset-dropzone${dragging ? ' is-dragging' : ''}${disabled ? ' is-disabled' : ''}`}
        data-testid="asset-dropzone"
        htmlFor={inputId}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setDragging(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled) addFiles(Array.from(event.dataTransfer.files));
        }}
      >
        <input
          id={inputId}
          className="visually-hidden"
          type="file"
          aria-label="Assets"
          accept={SUPPORTED_ASSET_MIME_TYPES.join(',')}
          multiple
          disabled={disabled}
          onChange={(event) => {
            addFiles(Array.from(event.currentTarget.files ?? []));
            event.currentTarget.value = '';
          }}
        />
        <UploadCloud aria-hidden="true" size={25} strokeWidth={1.7} />
        <span>
          <strong>Drop launch files here</strong>
          <small>PDF, text, CSV, JSON, PNG, JPG or WebP · 20 MB max</small>
        </span>
      </label>

      {message ? (
        <p className="field-message field-message-error" role="alert">
          {message}
        </p>
      ) : null}

      {files.length > 0 ? (
        <ul className="asset-list" aria-label="Selected assets">
          {files.map((file) => (
            <li key={fileKey(file)}>
              <FileText aria-hidden="true" size={16} strokeWidth={1.7} />
              <span>
                <strong>{file.name}</strong>
                <small>{formatBytes(file.size)}</small>
              </span>
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove ${file.name}`}
                disabled={disabled}
                onClick={() => onFilesChange(files.filter((candidate) => candidate !== file))}
              >
                <X aria-hidden="true" size={16} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
