# Deploying the frontend to Vercel

This repository contains a small static frontend under `google-signin-project/`. The `vercel.json` is configured to serve that folder as the site root.

Two easy ways to deploy:

1) Use the Vercel web dashboard (recommended)
   - Go to https://vercel.com and sign in (GitHub/GitLab/Email).
   - Create a new Project -> Import from Git.
   - Select this repository.
   - In the Project Settings, set the Root Directory to the repository root (no build command needed because `vercel.json` uses `@vercel/static`).
   - Deploy. Vercel will pick up `vercel.json` and serve files from `google-signin-project/`.

2) Use the Vercel CLI (PowerShell example)
   - Install the CLI (one-time):
     ```powershell
     npm i -g vercel
     ```
   - From the repository root run:
     ```powershell
     cd C:\Users\elayk\CMPS411AcceleratedAdvising
     vercel login
     vercel --prod
     ```
   - When the CLI asks, accept the defaults. Because `vercel.json` declares the static build, the CLI will deploy the `google-signin-project` files and serve `index.html`.

Notes & next steps
- If you need environment variables (e.g., API keys), set them in the Vercel Dashboard under Project Settings -> Environment Variables. Avoid hard-coding secrets in files served to the browser.
- If you want the site to be at the root of the repository without the `google-signin-project` path, the `routes` in `vercel.json` already rewrite `/` and `/(.*)` to files inside `google-signin-project/`.
- If you want me to push a commit, create a branch, or run the `vercel` CLI flow for you, tell me and I will show the exact commands to run locally (I cannot run them without your credentials).
