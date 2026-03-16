# n8n on SAP BTP Cloud Foundry

Minimal, secure deployment setup for n8n with PostgreSQL on Cloud Foundry.

## Repository contents
- Cloud Foundry manifest template: manifest.yml
- Scripts:
  - scripts/cf-prepare-deploy.mjs
  - scripts/pull-cf-secrets.mjs

## End-to-end flow
1. Clone repository
2. Login to Cloud Foundry
3. Create PostgreSQL service instance (if missing)
4. Create temporary service key and extract credentials
5. Optionally bind service to an existing app
6. Deploy to Cloud Foundry

## Prerequisites
- CF CLI v8+ installed
- Targeted org/space (`cf target`)

## Quick start
1. Login and target your CF org/space

```bash
cf login --sso -a <api-endpoint>
cf target -o <org> -s <space>
```

2. Bootstrap and deploy

```bash
npm run cf:bootstrap
```

This runs:
- `npm run cf:prepare`
- `npm run cf:deploy`

## What cf:prepare does
- Ensures service instance `n8n-db` exists (creates if missing)
- Waits until service is ready
- Reads PostgreSQL credentials from bound app `VCAP_SERVICES` when available
- Otherwise creates a temporary service key and reads credentials from it
- Writes `vars.secrets.yml` for optional local/debug use
- Deletes temporary service key (when one was created)

Fresh clone behavior:
- `npm run cf:bootstrap` works on first run after `cf login`.
- Even if service-key creation is restricted, deploy can continue because runtime DB credentials come from bound `VCAP_SERVICES`.
- Use strict mode only if you require local secrets file generation:
```bash
node scripts/cf-prepare-deploy.mjs --service n8n-db --app n8n-appp --require-secrets
```

Default wait behavior:
- Waits up to 15 minutes for PostgreSQL provisioning
- Polls every 10 seconds

You can override this if your foundation is slower:
```bash
node scripts/cf-prepare-deploy.mjs --service n8n-db --wait-minutes 30 --poll-seconds 15
```

## Deploy command used
```bash
cf push -f manifest.yml
```

Database credential behavior:
- Runtime DB credentials are sourced from bound `VCAP_SERVICES` in app startup.
- This avoids per-account service-key credential mismatches during deploy.

Route behavior:
- `manifest.yml` uses `random-route: true` to avoid route collisions across accounts/spaces.
- After deploy, get your URL with:
```bash
cf app n8n-appp
```

## Optional: bind service to an existing app
```bash
node scripts/cf-prepare-deploy.mjs --service n8n-db --bind-app <app-name>
cf restage <app-name>
```

Note:
During normal deploy, binding is handled by `services:` in `manifest.yml`.

## Useful commands
```bash
npm run cf:prepare
npm run cf:deploy
npm run secrets:pull -- --service n8n-db --out .env.cf
```

## Security
- No DB credentials in manifest.yml
- vars.secrets.yml is generated locally and gitignored
- Temporary service key is deleted automatically
- .env.cf and local secret files remain gitignored

## If your service name is different
```bash
node scripts/cf-prepare-deploy.mjs --service <your-service-name> --offering postgresql-db --plan trial --secrets-file vars.secrets.yml
```

