# Prime Rose — MOE Launcher (Vercel, Next.js)

A single-page launcher that starts the MOE stack on-demand by calling the orchestrator endpoints exposed by the MOE Cloud Run service.

## Environment variables (Vercel)
- ORCHESTRATOR_URL: Base URL to orchestrator endpoints, e.g. `https://moe-app-xxxx.a.run.app/api/orchestrator`
- ORCHESTRATOR_API_KEY: Optional; must match the MOE service ORCH_API_KEY if set.

## Local dev
Create `.env.local` in this folder with values for local testing (do not commit secrets):

```
ORCHESTRATOR_URL=https://moe-app-xxxx.a.run.app/api/orchestrator
ORCHESTRATOR_API_KEY=
```

Then run:

```
npm install
npm run dev
```

## Build
```
npm run build
```
