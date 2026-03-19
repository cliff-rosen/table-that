---
name: deploy
description: Run the full deployment pipeline — quality gates, git workflow, deploy to production, post-deploy verification. Guides the user through merging develop into main and running deploy.ps1.
---

# Deploy to Production

## Arguments

$ARGUMENTS — optional flags:
- `--skip-qa` — skip the QA walkthrough gate (use for backend-only changes)
- `--frontend` — deploy frontend only
- `--backend` — deploy backend only

If no arguments, deploy both frontend and backend with all gates.

## Overview

This skill orchestrates the full Verify → Deploy → Observe transition from the management plane. It runs quality gates in order, guides the git merge workflow, executes `deploy.ps1`, and verifies the deployment.

## Pre-flight

Before anything else, check the current state:

1. Run `git status` and `git branch` to confirm:
   - You are on `develop` (if not, ask the user which branch has the work)
   - Working tree status (uncommitted changes are OK — we'll handle them)
2. Run `git log develop --oneline -5` and `git log main --oneline -5` to show the user what's on each branch
3. Run `git diff main..develop --stat` to show what will be deployed
4. If there's nothing to deploy (develop and main are at the same commit), tell the user and stop

Present a summary: "Here's what will be deployed:" with the diff stat and recent commits on develop.

## Gate 1: Uncommitted Changes

If there are uncommitted changes on develop:
1. Show the user what's uncommitted (`git status --short`)
2. Ask: "These changes need to be committed before deploying. Should I commit them now?"
3. If yes, stage and commit with a descriptive message
4. If no, stop — user needs to handle this first

## Gate 2: Code Review

Run the `/review` skill against the changes between main and develop:
1. Run: `git diff main..develop --name-only` to get changed files
2. Invoke the `/review` skill on those files
3. If review finds Critical or Important issues, stop and report them — deployment is blocked
4. If review is clean or only has Minor suggestions, proceed

## Gate 3: Automated Tests

Run the backend test suite:
1. Run: `backend/venv/Scripts/python.exe -m pytest backend/tests/ -v`
2. All tests must pass. If any fail, stop — deployment is blocked
3. Report: "Tests passed: X passed, 0 failed"

## Gate 4: Frontend Build Check

Verify the frontend builds cleanly:
1. Run: `cd frontend && npm run build`
2. Must complete with exit code 0
3. If it fails, stop — deployment is blocked
4. Report: "Frontend build: OK"

## Gate 5: Pre-deploy QA (skippable)

If `--skip-qa` was NOT passed:
1. Tell the user: "The QA walkthrough is recommended for UI changes. It takes several minutes."
2. Ask: "Run QA walkthrough, or skip? (Changes are backend-only / I already tested manually)"
3. If running, invoke `/qa-walkthrough`
4. If QA finds Critical or Medium issues, stop — deployment is blocked

If `--skip-qa` was passed, report: "QA walkthrough: skipped (--skip-qa)"

## Gates Summary

After all gates pass, present a summary:

```
=== Pre-deploy Gates ===
  Code review:    PASSED
  Tests:          PASSED (X passed)
  Frontend build: PASSED
  QA walkthrough: PASSED / SKIPPED
```

Ask: "All gates passed. Ready to deploy?"

## Deploy: Git Workflow

Once the user confirms:

1. Make sure develop is pushed:
   ```
   git push origin develop
   ```

2. Switch to main and merge:
   ```
   git checkout main
   git pull origin main
   git merge develop
   ```

3. If merge conflicts occur, stop and help the user resolve them. Do NOT proceed with conflicts.

4. Push main:
   ```
   git push origin main
   ```

## Deploy: Run deploy.ps1

Now run the deploy script. Build the command based on arguments:

- Default (no flags): `powershell -File deploy.ps1`
- `--frontend` only: `powershell -File deploy.ps1 -Frontend`
- `--backend` only: `powershell -File deploy.ps1 -Backend`

**IMPORTANT:** The deploy script is interactive — it prompts for confirmation ("Proceed? (y/n)"). Tell the user they need to confirm in the terminal. Run it and monitor for success or failure.

If deploy fails, stop and report the error. Do NOT proceed to post-deploy steps.

## Post-deploy: Verification

After deploy.ps1 completes successfully:

1. Wait 15 seconds for the backend to restart on EB
2. Check the health endpoint:
   ```
   curl -s https://api.tablethat.ai/api/health
   ```
   - Verify `status` is `"healthy"`
   - Verify `database` is `"healthy"`
   - Verify `version` matches the tag that was just created
   - If `status` is `"degraded"`, warn the user immediately

3. Check the frontend is serving:
   ```
   curl -s -o /dev/null -w "%{http_code}" https://tablethat.ai
   ```
   - Should return 200

4. Report results:
   ```
   === Post-deploy Verification ===
     Backend health: healthy (vX.Y.Z)
     Database:       healthy
     Frontend:       200 OK
   ```

## Post-deploy: Sync Branches

Sync develop with main so both branches are aligned:

```
git checkout develop
git merge main
git push origin develop
```

## Post-deploy: Summary

Print the final summary:

```
=== Deployment Complete ===
  Version:  vX.Y.Z
  Frontend: https://tablethat.ai
  Backend:  https://api.tablethat.ai/api/health
  Release:  https://github.com/cliff-rosen/table-that/releases/tag/vX.Y.Z

  Branches main and develop are in sync.
```

## Failure Recovery

If deployment fails at any point after merging to main:

1. Do NOT automatically revert the merge
2. Report exactly what failed
3. Suggest next steps:
   - If deploy.ps1 failed: fix the issue on develop, commit, re-merge, re-deploy
   - If post-deploy health check fails: check EB logs (`eb logs`), consider `deploy.ps1 -SkipTag` to re-deploy
   - If frontend failed but backend succeeded (or vice versa): re-run with the specific flag (`--frontend` or `--backend`)
