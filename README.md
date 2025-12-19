# rpx-xui-e2e-tests

Expert UI E2E test suite

## Secrets and .env generation (Key Vault + get-secrets)

This repo uses the `get-secrets` helper shipped with `@hmcts/playwright-common` to populate `.env` from Azure Key Vault.

How tagging works:
- In Key Vault, tag each secret you want in `.env` with `e2e=<ENV_VAR_NAME>`.
- The secret name does not matter; the `e2e` tag value becomes the env var name. The secret value becomes the env var value.

How to fetch secrets locally (after `az login`):

```bash
cd /Users/andrew.grizhenkov/HMCTS/dev/PROJECTS/rpx-xui-e2e-tests
# optional: clear old env
rm -f .env
# default: reads .env.example, writes .env, uses vault rpx-aat
yarn get-secrets rpx-aat
# or multiple vaults, explicit paths:
node ./node_modules/@hmcts/playwright-common/dist/scripts/get-secrets.js "rpx-aat,another-vault" .env.example .env
```

What the helper does:
- Lists secrets in each vault: `az keyvault secret list --vault-name <vault> --query "[].{id:id, tags:tags}" -o json`.
- For secrets tagged with `e2e`, it fetches their values and maps `tags.e2e` → env var name.
- Reads `.env.example` and replaces any `KEY=` lines where `KEY` matches a tagged env var, then writes `.env`.

If a value stays blank in `.env`, add the `e2e=<ENV_VAR_NAME>` tag to the corresponding Key Vault secret and rerun `yarn get-secrets <vault>`.

Key env vars to tag:
- `TEST_URL`, `TEST_ENV`
- `IDAM_SECRET`, `IDAM_WEB_URL`, `IDAM_TESTING_SUPPORT_URL`, `S2S_URL`, `S2S_MICROSERVICE_NAME`
- User creds: `SOLICITOR_USERNAME` / `SOLICITOR_PASSWORD`, `CASEOFFICER_R1_USERNAME` / `CASEOFFICER_R1_PASSWORD`, `CASEOFFICER_R2_USERNAME` / `CASEOFFICER_R2_PASSWORD`
- Optional sample IDs: `WA_SAMPLE_TASK_ID`, `WA_SAMPLE_ASSIGNED_TASK_ID`, `ROLE_ACCESS_CASE_ID`, `EM_DOC_ID`
