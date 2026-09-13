# VibeFlare CI runner

Canonical repository: `alexcodeplace/vibeflare`. The local checkout may still be named `spargax-vibeflare`; its Git origin must be `https://github.com/alexcodeplace/vibeflare.git`.

The PR gate uses the existing persistent runner `vibeflare-debian1` on `debian1`, registered with the `vibeflare-gate` label. Its user service is `runner-vibeflare-debian1.service`; installation directory is `/home/user/actions-runner-vibeflare-debian1`. Other runners on this host must not be stopped or reconfigured during maintenance.

## Registration repair — 2026-09-13

The repository reported zero registered runners even though the host service was running and its saved URL already named `vibeflare`. The stale installation also contained `.runner_migrated` metadata. Stopping only this service, privately backing up both registration files and the credential metadata, and obtaining a fresh repository-scoped registration restored connectivity. The new runner ID is `21`; GitHub reports it online with the expected labels, and it has executed a real PR Gate workflow successfully.

Do not diagnose this from the directory name or URL alone. Compare the current repository's runner API with the local registration and check an actual workflow run. A renamed/replaced repository can leave a running runner registered to an obsolete repository identity.

## Operational checks

```sh
gh api repos/alexcodeplace/vibeflare/actions/runners \
  --jq '.runners[] | {id,name,status,busy,labels:[.labels[].name]}'
gh run list --repo alexcodeplace/vibeflare --workflow pr-gate.yml
ssh debian1 systemctl --user status runner-vibeflare-debian1.service
```

Registration tokens belong only in process memory/environment, not terminal output, Git, or documentation. Stop a runner only when it is not executing a job. Keep private rollback copies outside the repository, include migrated registration metadata when re-registering, and restore the prior registration if configuration fails. Never disable the fork-PR guard, required checks, or production isolation to make a job pass.

Official references:
- https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners
- https://docs.github.com/en/actions/reference/runners/self-hosted-runners
