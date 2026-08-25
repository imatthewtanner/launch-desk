'use client';

import { ArrowRight, LogIn, Radar, X } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';

import { LaunchBriefForm, type LaunchBriefSubmission } from '@/components/forms/launch-brief-form';
import { ResultTabs } from '@/components/results/result-tabs';
import { ProgressRail } from '@/components/stream/progress-rail';
import {
  useLaunchStream,
  type PlanRequestPayload,
} from '@/hooks/use-launch-stream';
import {
  AssetReferenceSchema,
  type AssetReference,
} from '@/lib/contracts/launch';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface MissionControlProps {
  guestMode: boolean;
  fetcher?: FetchLike;
  planEndpoint?: string;
}

interface GuestWorkspace {
  ownerId: string;
  sessionId: string;
}

type LocalPhase = 'creating' | 'uploading' | null;

const GUEST_STORAGE_KEY = 'launch-desk:guest-workspace';

function randomId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function loadGuestWorkspace(): GuestWorkspace {
  try {
    const stored = localStorage.getItem(GUEST_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<GuestWorkspace>;
      if (parsed.ownerId && parsed.sessionId) {
        return { ownerId: parsed.ownerId, sessionId: parsed.sessionId };
      }
    }
  } catch {
    // A fresh local identity is safe when browser storage is unavailable or corrupt.
  }

  const workspace = {
    ownerId: randomId('guest'),
    sessionId: randomId('session'),
  };
  try {
    localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(workspace));
  } catch {
    // Guest mode still works for the active page without persistence.
  }
  return workspace;
}

function titleFromBrief(brief: string): string {
  const firstSentence = brief.trim().split(/[.!?\n]/)[0] ?? '';
  const cleaned = firstSentence.replace(/^(launch|release|ship)\s+/i, '').trim();
  return (cleaned || 'Untitled launch').slice(0, 120);
}

async function safeJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

export function MissionControl({
  guestMode,
  fetcher = fetch,
  planEndpoint = '/api/agent/plan',
}: MissionControlProps) {
  const stream = useLaunchStream(fetcher, planEndpoint);
  const [guestWorkspace, setGuestWorkspace] = useState<GuestWorkspace | null>(null);
  const [localPhase, setLocalPhase] = useState<LocalPhase>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [currentPayload, setCurrentPayload] = useState<PlanRequestPayload | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [email, setEmail] = useState('');
  const [authStatus, setAuthStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!guestMode) return;
    const frame = requestAnimationFrame(() => setGuestWorkspace(loadGuestWorkspace()));
    return () => cancelAnimationFrame(frame);
  }, [guestMode]);

  const active =
    localPhase !== null ||
    stream.state.status === 'connecting' ||
    stream.state.status === 'streaming';
  const busyLabel =
    localPhase === 'creating'
      ? 'Creating workspace'
      : localPhase === 'uploading'
        ? 'Uploading assets'
        : 'Building launch plan';
  const visibleFollowUps = stream.state.result?.followUpQuestions ?? stream.state.followUps;
  const displayTitle = currentPayload?.launch.title ?? 'Your launch plan';
  const readiness = stream.state.result?.readiness;

  const liveText = useMemo(
    () => stream.state.text.replace(/[{}[]"]/g, ' ').replace(/\s+/g, ' ').trim(),
    [stream.state.text],
  );

  async function uploadAsset(
    file: File,
    launchId: string,
    guest: NonNullable<PlanRequestPayload['guest']> | null,
  ): Promise<AssetReference> {
    const signResponse = await fetcher('/api/assets/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        launchId,
        filename: file.name,
        mimeType: file.type,
        byteSize: file.size,
        guest,
      }),
    });
    const signed = await safeJson(signResponse);
    if (!signResponse.ok) {
      throw new Error(
        typeof signed.error === 'string' ? signed.error : `Could not upload ${file.name}.`,
      );
    }

    const upload = signed.upload as {
      signedUrl: string;
      path: string;
      token?: string;
    };
    if (guest) {
      const uploadResponse = await fetcher(upload.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!uploadResponse.ok) throw new Error(`Could not upload ${file.name}.`);
    } else {
      if (!upload.token) throw new Error(`Could not authorize ${file.name}.`);
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.storage
        .from('launch-assets')
        .uploadToSignedUrl(upload.path, upload.token, file, { contentType: file.type });
      if (error) throw new Error(`Could not upload ${file.name}.`);
    }

    return AssetReferenceSchema.parse(signed.asset);
  }

  async function buildPlan(launch: LaunchBriefSubmission, files: File[]) {
    setLocalError(null);
    stream.reset();
    const titledLaunch = {
      ...launch,
      title: launch.title === 'Untitled launch' ? titleFromBrief(launch.productBrief) : launch.title,
      assets: [] as AssetReference[],
    };
    const workspace = guestMode ? guestWorkspace ?? loadGuestWorkspace() : null;
    if (guestMode && !guestWorkspace) setGuestWorkspace(workspace);
    const guest = workspace
      ? { ...workspace, runId: randomId('upload') }
      : null;

    try {
      setLocalPhase('creating');
      const createResponse = await fetcher('/api/launches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ launch: titledLaunch, guest }),
      });
      const created = await safeJson(createResponse);
      if (!createResponse.ok) {
        throw new Error(
          typeof created.error === 'string' ? created.error : 'The launch could not be created.',
        );
      }
      const launchId = (created.launch as { id?: unknown } | undefined)?.id;
      if (typeof launchId !== 'string') throw new Error('The launch response was incomplete.');

      setLocalPhase(files.length > 0 ? 'uploading' : null);
      const assets = await Promise.all(files.map((file) => uploadAsset(file, launchId, guest)));
      const payload: PlanRequestPayload = {
        launchId,
        launch: { ...titledLaunch, assets },
        guest,
      };
      setCurrentPayload(payload);
      setLocalPhase(null);
      await stream.start(payload);
    } catch (error) {
      setLocalPhase(null);
      setLocalError(error instanceof Error ? error.message : 'The launch could not be started.');
    }
  }

  function refinePlan(answers: Record<string, string>) {
    if (!currentPayload || !stream.state.result) return;
    const answeredQuestions = stream.state.result.followUpQuestions
      .filter((question) => answers[question.id]?.trim())
      .map((question) => `${question.question}\nAnswer: ${answers[question.id].trim()}`)
      .join('\n\n');
    if (!answeredQuestions) return;

    const payload: PlanRequestPayload = {
      ...currentPayload,
      parentRunId: stream.state.runId,
      priorResult: stream.state.result,
      launch: {
        ...currentPayload.launch,
        constraints: [currentPayload.launch.constraints, answeredQuestions]
          .filter(Boolean)
          .join('\n\n'),
      },
    };
    setCurrentPayload(payload);
    void stream.start(payload);
  }

  async function requestMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthStatus(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${location.origin}/auth/callback` },
      });
      if (error) throw error;
      setAuthStatus('Check your inbox for the secure sign-in link.');
    } catch {
      setAuthStatus('Magic-link sign-in is unavailable in this local workspace.');
    }
  }

  return (
    <main className="mission-shell">
      <header className="topbar">
        <a className="brand" href="#workspace" aria-label="Launch Desk home">
          <Radar aria-hidden="true" size={22} strokeWidth={1.8} />
          <span>Launch Desk</span>
        </a>
        <div className="workspace-actions">
          <span>{guestMode ? 'Guest workspace' : 'Team workspace'}</span>
          <button type="button" className="sign-in-button" onClick={() => setShowAuth(true)}>
            Sign in
          </button>
        </div>
      </header>

      <div id="workspace" className="workspace-grid">
        <aside className="intake-rail" aria-labelledby="intake-title">
          <div className="intake-heading">
            <h1 id="intake-title">Plan the launch. Find the gaps.</h1>
            <p>Turn a rough brief into a release plan your team can run.</p>
          </div>
          <LaunchBriefForm
            onSubmit={buildPlan}
            busy={active}
            busyLabel={busyLabel}
            externalError={localError}
          />
        </aside>

        <section className="result-canvas" aria-labelledby="result-title">
          <header className="result-header">
            <div>
              <p>Launch plan</p>
              <h2 id="result-title">{displayTitle}</h2>
            </div>
            <div className="readiness-score" aria-label={readiness ? `Readiness ${readiness.total} out of 100` : 'Readiness pending'}>
              <span>{readiness?.total ?? '—'}</span>
              <small>/ 100</small>
              <strong>Readiness</strong>
            </div>
          </header>

          {stream.state.result ? (
            <ResultTabs result={stream.state.result} onRefine={refinePlan} />
          ) : (
            <div className={`result-empty is-${stream.state.status}`}>
              {active || liveText ? (
                <>
                  <div className="signal-line" aria-hidden="true"><span /></div>
                  <h3>The launch plan is taking shape.</h3>
                  <p>Readiness, ownership, risks, and launch copy will resolve as the agent works.</p>
                  {liveText ? (
                    <div className="streaming-preview" aria-live="polite">
                      <span>Agent draft</span>
                      <p>{liveText.slice(-360)}<i aria-hidden="true" /></p>
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <div className="empty-orbit" aria-hidden="true"><Radar size={32} /></div>
                  <h3>Your release path will appear here.</h3>
                  <p>Add the known facts. Launch Desk will build a provisional plan and surface the gaps.</p>
                </>
              )}
            </div>
          )}

          {stream.state.error ? (
            <div className="terminal-error" role="alert" aria-live="assertive">
              <strong>
                {stream.state.status === 'partial' ? 'The run ended with a partial plan.' : 'The run could not finish.'}
              </strong>
              <span>{stream.state.error.message}</span>
            </div>
          ) : null}

          {stream.state.result && visibleFollowUps.length > 0 ? (
            <button
              type="button"
              className="refine-link"
              onClick={() => {
                const tab = document.querySelector<HTMLButtonElement>('[role="tab"][aria-controls$="questions-panel"]');
                tab?.click();
                tab?.focus();
              }}
            >
              Refine with follow-up answers <ArrowRight aria-hidden="true" size={17} />
            </button>
          ) : null}
        </section>

        <ProgressRail
          activity={stream.state.activity}
          status={localPhase ? 'connecting' : stream.state.status}
          followUps={visibleFollowUps}
          onCancel={stream.cancel}
        />
      </div>

      {active ? (
        <div className="mobile-run-status" aria-live="polite">
          <span>{busyLabel}</span>
          <button type="button" onClick={stream.cancel}>Cancel</button>
        </div>
      ) : null}

      {showAuth ? (
        <div className="dialog-backdrop" role="presentation">
          <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
            <button className="dialog-close" type="button" aria-label="Close sign in" onClick={() => setShowAuth(false)}>
              <X aria-hidden="true" size={18} />
            </button>
            <LogIn aria-hidden="true" size={24} />
            <h2 id="auth-title">Sign in to Launch Desk</h2>
            <p>Use a secure magic link to keep launches, assets, and run history in your workspace.</p>
            <form onSubmit={requestMagicLink}>
              <label htmlFor="auth-email">Work email</label>
              <input id="auth-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
              <button className="primary-button" type="submit">Send magic link</button>
            </form>
            {authStatus ? <p className="auth-status" role="status">{authStatus}</p> : null}
          </section>
        </div>
      ) : null}
    </main>
  );
}
