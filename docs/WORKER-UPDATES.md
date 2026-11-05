# Outbound worker updates

Normal app builds now publish `/worker-updates/channel.json` and an immutable,
SHA-256-addressed worker bundle. The VM checks its configured HTTPS Planner origin
every five minutes while idle. No SSH, inbound port, Windows connection, GitHub
credentials, or new pairing is needed after the one-time updater installation.
The deployed Planner origin is the release authority; hashes detect corruption,
not a compromised app deployment. Redirects are rejected and downloads are bounded.

Site additions still require registering the source in the web/server and worker
code, including source-specific sign-in detection and read support. Deploying that
change publishes the worker release automatically. Users can then enable the site
and sign in privately through Add sites. Accounts with explicitly enabled interactive control can also operate real pages
through the tools in docs/INTERACTIVE-BROWSER.md. Source-specific extracted readers
still do not guarantee that every site's data is available.

## Existing VM: one-time installation

Wait for agent work to finish and close private connection browsers. In an
Administrator PowerShell at the checkout, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-worker-updates.ps1
```

The script asks for the Planner password privately only to check for pending work;
it does not persist it. It authenticates the existing Multipass guest, or uses
direct SSH after matching the guest IP to its Hyper-V MAC address. Direct SSH uses
a temporary owner-restricted copy of the existing Multipass key, removed in cleanup;
the original key and hosts file are unchanged. It stages the updater
files, and changes the worker's systemd entry point. It never provisions a VM.
Do not queue new work during this initial maintenance window. The guest installer
requires a stopped worker; failure restarts the old service. New VMs receive the
supervisor through normal bootstrap automatically.

If the existing dependency lockfile differs, this initial maintenance install
backs up its packages and installs the checkout's reviewed worker lockfile with
`npm ci --omit=dev --ignore-scripts`. Failure restores the old packages. Future
automatic releases cannot install dependencies; a changed lockfile defers them.

## Installation and rollback

Only `.mjs` runtime files are published, excluding tests. The complete release is
validated and syntax checked before activation. The worker package and lockfile
must match the installed dependency digest. Dependency/OS changes require explicit
maintenance; no remote npm scripts or administrator commands run automatically.
The systemd supervisor remains installer-owned under `/opt/planner`.

Updates occur between jobs, before the next claim, and defer while a private
browser is open. The worker closes its browser processes cleanly before switching;
saved profiles, sessions, pairing and workspace stay under `/var/lib/planner`.
Releases are staged separately under `/var/lib/planner/releases/<sha256>` and reuse
the installed dependencies. The previous version remains available.

A candidate must complete an authenticated worker claim within two minutes.
Startup failure/timeout rolls back to the previous worker and blocks that revision
in `/var/lib/planner/worker-updates.json`. Publish a corrected release to retry.
A reboot during candidate startup also rejects the unverified version. The first
installation can fall back to the original `/opt/planner/main.mjs`.

Logs: `journalctl -u planner-worker`; status and revision:
`/var/lib/planner/worker-updates.json`. A readiness handshake proves startup and
server connectivity, not that every source integration works: each new site still
needs a signed-in browser test. Old releases are retained for recovery; an operator
may remove unused older directories during maintenance after inspecting state.
