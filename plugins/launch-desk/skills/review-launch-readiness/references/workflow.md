# Launch Readiness Workflow

Launch Desk evaluates eight weighted areas totaling 100 points:

- scope and success criteria
- ownership and decision rights
- technical readiness
- test and quality evidence
- rollout strategy
- rollback and recovery
- observability
- support readiness

Interpret the generated result rather than recalculating it manually. A low score is a prompt to close evidence gaps, not proof that a launch will fail.

## Reporting order

1. Overall score and concise readiness status.
2. P0 gaps that can block safe release.
3. Critical and high risks with cited evidence.
4. Missing owners and unresolved decisions.
5. P1/P2 recommendations in dependency order.
6. Follow-up questions needed to improve confidence.

When sources disagree, name the conflict and ask for authoritative resolution. Do not silently choose between plan text, repository evidence, and Linear records.

## Issue preview contract

Preparing an issue batch is read-only. The preview must display:

- provider and destination
- issue title
- full description
- originating recommendation

Creation is permitted only through the signed, unexpired preview after explicit user approval. A changed title, description, provider, destination, user, or expired token requires a new preview.
