# Bass Practice Tracker

The original 53-song design, with browser autosave, TXT import/export, and optional private cloud progress using Supabase email/password accounts. No build or npm dependencies.

## Run locally

From `/workspace/bass`: `python -m http.server 8000 --directory site`.
Open the site in a browser. Edit notes, tuning, confidence and practice status as before. The uploaded TXT data is included as the initial state; existing browser progress takes precedence.

## Enable cross-device progress

1. Create a Supabase project at https://supabase.com. In SQL Editor run `supabase/setup.sql`. It enables row-level security so each signed-in account can access only its own progress.
2. In Project Settings → API (or Connect), copy the Project URL and **public publishable key** (a legacy anon key also works). Never use a secret or service-role key.
3. Put those two public settings into `site/cloud-config.js` before publishing, or enter them using Cloud settings on each device.
4. Under Authentication → URL Configuration set Site URL to the published website URL. Keep email/password sign-in enabled. Create an account in the tracker, confirm the email, then sign in on both devices using the same account. Configure an email provider if Supabase's built-in email limits are insufficient.
5. First sign-in uploads browser progress only if the account has no cloud data. Subsequent sign-ins load cloud data, retaining locally pending changes. Changes sync after editing, when returning to the tab, and every 30 seconds while open. Concurrent edits to the same song use the last uploaded version. Edits to separate songs are stored separately.

Use Save TXT periodically for a portable backup. Browser progress works without Supabase; cross-device sync requires the database setup. Sign in again after closing the tab. Use a separate browser profile for another account. Reset also resets synced progress after sign-in.

## Publish on GitHub Pages

Push these files to the `main` branch of `alesahsc/bass`. In the repository's Settings → Pages choose **GitHub Actions** as the source, then run the Publish practice tracker workflow (or push another commit). The workflow deploys only `site/`. The expected default URL is `https://alesahsc.github.io/bass/`; use the successful deployment's actual URL. A private repository may require a suitable GitHub plan for Pages.

Source files and the seed TXT are publicly readable if you publish the site publicly. Account progress stays in the Supabase database under row-level security; no account password is stored by the app. Do not put private progress or credentials in committed seed files.

## Development environment

Use the existing checkout. Each cloud task is already isolated; no additional Git worktree is needed. There are no packages to install. Start the static HTTP server above when needed; processes do not survive environment snapshots.
