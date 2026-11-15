# Deploy the Worker

This puts the Outage Worker on Cloudflare for free. You do it once. After that, every push to `main` that changes the Worker deploys it.

Firebase is not needed for this step. You only need your Cloudflare account.

## 1. Make a Cloudflare API token

1. Sign in at the Cloudflare dashboard.
2. Open **My Profile**, then **API Tokens**. (Or open **Manage Account**, then **Account API tokens**.)
3. Click **Create Token**.
4. Find the **Edit Cloudflare Workers** template and click **Use template**.
5. Under **Account Resources**, pick your own account only. Under **Zone Resources**, pick **All zones from an account**, then your account. If you have no domain, any choice that lets you continue is fine.
6. Click **Continue to summary**, then **Create Token**.
7. Copy the token now. Cloudflare shows it only once.

Doc: https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/

## 2. Find your Account ID

1. In the dashboard, open **Workers & Pages**.
2. Your **Account ID** is shown on the right side of the page. Click to copy it.

Doc: https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/

## 3. Turn on your workers.dev address (first time only)

1. In the dashboard, open **Workers & Pages**.
2. If you see **Your subdomain**, you already have one. If not, choose a name and save it. This name becomes the middle part of the Worker's address: `outage-api.<your-name>.workers.dev`.

Doc: https://developers.cloudflare.com/workers/configuration/routing/workers-dev/

## 4. Add the GitHub secrets

In the GitHub repo, open **Settings**, then **Secrets and variables**, then **Actions**. Click **New repository secret** for each:

| Name | Value | Needed |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | the token from step 1 | yes |
| `CLOUDFLARE_ACCOUNT_ID` | the ID from step 2 | yes |
| `FIELD_READ_TOKEN` | any long random string you keep, for example the output of `openssl rand -hex 32` | optional |

`FIELD_READ_TOKEN` protects the daily field report. The field-report reader needs the same value later, so save it somewhere safe. Without it, `/v1/admin/field/...` answers 500 and nothing else breaks.

You do not make `INSTALL_TOKEN_SECRET`. The workflow creates it the first time and never changes it afterwards.

## 5. Run the workflow

1. Open the **Actions** tab, then **deploy-worker** on the left.
2. Click **Run workflow**, keep the branch as `main`, and click the green button.
3. When it finishes, open the run. The summary shows `Deployed: https://outage-api.<your-name>.workers.dev`.

The run does these things in order: checks (lint, typecheck, tests, spec lint), deploy, create `INSTALL_TOKEN_SECRET` if it is missing, push `FIELD_READ_TOKEN` if you set it, then a smoke check that loads `/` and `/api/v1/public/judge/replay` and fails if either is not a 2xx answer.

If the two Cloudflare secrets are missing, the run still ends green. It prints "Deploy skipped" and nothing is deployed.

## If something goes wrong

- **"No workers.dev URL"**: do step 3, then run again.
- **Authentication error**: the token is wrong or limited to a different account. Make a new one in step 1 and replace the GitHub secret.
- **Smoke check fails**: open the Worker in the dashboard, then **Logs**, and look at the error.
- **Do not delete the Worker.** `INSTALL_TOKEN_SECRET` lives only there. If it is lost, every install needs a new token.

Decision record: `docs/adr/0021-worker-deploy-and-secret-bootstrap.md`.
