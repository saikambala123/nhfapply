# Appli-Fill 2.0.1

## Install this update

1. Deploy this updated dashboard/backend to your existing Vercel project using your existing environment variables.
2. Replace your unpacked extension with `dist/chrome` and click Reload on `chrome://extensions`. Chrome/Edge packages and a Firefox package are also included in `dist`.
3. Open the extension, click **Authenticate now**, and sign in to the dashboard. If the dashboard is already signed in, the extension connects automatically.
4. Reopen the extension to see **Welcome ZApply**. This animation runs once for each new authentication, including after logout or inactivity expiry.

The packaged dashboard URL remains `https://zapply.vercel.app`. If you use a different deployment, enter its HTTPS URL under **Using your own server?** before clicking Authenticate now, or build with `APPLI_FILL_API_BASE` set to your deployment URL.

Existing installations must authenticate once after this update. Pairing codes are no longer accepted and the pairing API has been removed.

## Session behavior

- Opening the extension or starting an autofill counts as use.
- Three days (72 hours) without extension use ends that device's session.
- Background tab switches and synchronization do not extend that period.
- Daily use keeps the session active.
- Extension logout revokes that device's server session when the server is reachable and always clears its local credentials.
- Dashboard sign-out remains separate from extension sign-out.

The sidebar now keeps its navigation available during page loading, closes its mobile menu on navigation and Escape, and keeps the logo inside the dashboard.

## Verification

Passed: production build, ESLint, TypeScript, authentication worker checks, authentication API/session checks, existing extension synchronization checks, API regression checks, UI source regressions, and popup/sidebar DOM checks.

The authentication API tests use an in-memory persistence adapter. Popup/sidebar DOM checks do not run a real browser. Live Chromium and live MongoDB checks could not run in this environment because it blocks required process sockets. Production deployment, Google sign-in, and real browser extension installation have not been tested here.
