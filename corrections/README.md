# Corrections

Everything on the atlas was extracted from the papers by an AI agent and is **not
individually human-verified**. This folder is where readers' corrections land.

## How it works

1. On any claim page, wiki page or taxonomy page, use **"suggest a correction"**.
   It opens either a prefilled GitHub issue or this repository's new-file flow, which
   forks the repo for you and turns your note into a **pull request** adding one file here:

   ```
   corrections/<date>-<ref>.md
   ---
   ref: dk_W3174613487_S2        # the claim id / page key the correction targets
   date: 2026-10-05
   status: proposed
   ---
   What is wrong, and what it should say instead.
   ```

2. A maintainer checks the correction **against the paper itself**.
3. Accepted corrections are applied upstream in the Metalens dataset — where every
   change is a reviewed verification event with an audit trail — and the site is
   rebuilt from the next dataset release. The correction file's `status:` is then
   updated (`accepted` / `declined`, with a short reason).

Corrections never patch the generated files in `data/` directly: the dataset is the
source of truth, and its audit trail is the point of the whole project.
