# Branching Strategy

## Branch Structure

```
main (production)
  │
  v1.0.0 ── v1.0.1 ── v1.0.2 ── (future releases)
                                    ↑
                                    │ merge when ready to release
                                    │
develop (daily work)
  │
  ├── feature/foo
  ├── feature/bar
  └── all development happens here
```

### Long-Lived Branches

| Branch | Purpose | Deploys to |
|--------|---------|------------|
| `main` | Always matches production. Only moves forward via release merges or hotfixes. | Production |
| `develop` | Active development. All day-to-day work happens here. | Local dev only |

### Short-Lived Branches

| Branch | Created from | Merges into | Then |
|--------|-------------|-------------|------|
| `feature/*` | `develop` | `develop` | Delete branch |
| `hotfix/*` | `main` (or a version tag) | `main` AND `develop` | Tag on main, delete branch |

## Workflows

### Normal Development

```bash
git checkout develop
git checkout -b feature/my-feature
# ... work, commit ...
git checkout develop
git merge feature/my-feature
git branch -d feature/my-feature
```

When pushing a new local branch for the first time, set the upstream:

```bash
git push -u origin feature/my-feature
```

After the first push, plain `git push` works for that branch.

### Releasing to Production

```bash
# 1. Switch to main and merge develop
git checkout main
git merge develop

# 2. Deploy (tags, builds, and pushes to production)
.\deploy.ps1              # Deploy everything (frontend + backend)
.\deploy.ps1 -Frontend    # Frontend only
.\deploy.ps1 -Backend     # Backend only
.\deploy.ps1 -SkipTag     # Re-deploy current version without a new tag

# 3. Push main so the remote matches
git push origin main

# 4. Return to develop and sync
git checkout develop
git merge main             # Keep develop up-to-date with the release tag commit
git push origin develop
```

### Hotfixing Production

When a bug is found in production and `develop` has unreleased work:

```bash
# 1. Stash any in-progress work
git stash push -u -m "WIP: work before hotfix"

# 2. Create hotfix branch from main
git checkout main
git checkout -b hotfix/X.Y.Z

# 3. Fix and commit
git add <fixed-files>
git commit -m "fix: describe the bug fix"

# 4. Push the hotfix branch (first push needs -u)
git push -u origin hotfix/X.Y.Z

# 5. Merge into main and deploy
git checkout main
git merge hotfix/X.Y.Z
.\deploy.ps1

# 6. Push main
git push origin main

# 7. Merge into develop so the fix isn't lost
git checkout develop
git merge main
git push origin develop

# 8. Clean up
git branch -d hotfix/X.Y.Z
git push origin --delete hotfix/X.Y.Z

# 9. Restore stashed work
git stash pop
```

## Tagging Convention

- All production releases are tagged: `v1.0.0`, `v1.0.1`, `v1.0.2`, etc.
- Patch version auto-increments on each deploy (handled by the deploy script).
- Tags are permanent markers — never delete or move them.
- Hotfix branches are temporary — the tag is the permanent record.

## Rules

1. **Never commit directly to `main`** — it only receives merges.
2. **Never force-push `main`.**
3. **All dev work starts from `develop`.**
4. **Hotfixes always merge into both `main` and `develop`** so the fix isn't lost.
5. **Delete short-lived branches after merging** — tags and merge commits preserve history.
