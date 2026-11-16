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
| `FCM_SERVICE_ACCOUNT` | the whole Firebase service-account JSON file (Firebase console, Project settings, Service accounts, Generate new private key), pasted as one value | optional, needed for push |

`FIELD_READ_TOKEN` protects the daily field report. The field-report reader needs the same value later, so save it somewhere safe. Without it, `/v1/admin/field/...` answers 500 and nothing else breaks.

`FCM_SERVICE_ACCOUNT` lets the Worker send push messages through Firebase Cloud Messaging (free). The workflow stores it as a Wrangler secret and never prints it. Without it, following an area still works but no push is sent. Keep the key file out of git and delete your local copy once the secret is saved.

You do not make `INSTALL_TOKEN_SECRET`. The workflow creates it the first time and never changes it afterwards.

## 5. Run the workflow

1. Open the **Actions** tab, then **deploy-worker** on the left.
2. Click **Run workflow**, keep the branch as `main`, and click the green button.
3. When it finishes, open the run. The summary shows `Deployed: https://outage-api.<your-name>.workers.dev`.

The run does these things in order: checks (lint, typecheck, tests, spec lint), deploy, create `INSTALL_TOKEN_SECRET` if it is missing, push `FIELD_READ_TOKEN` and `FCM_SERVICE_ACCOUNT` if you set them, then a smoke check that loads `/` and `/api/v1/public/judge/replay` and fails if either is not a 2xx answer.

If the two Cloudflare secrets are missing, the run still ends green. It prints "Deploy skipped" and nothing is deployed.

## 6. Push on the phone (Firebase config for the Android app)

Follow pushes need the app to register with Firebase Cloud Messaging (free on the Spark plan). The app needs the Firebase config file for the Android app with package name `app.outage`. Only you can download it.

1. Firebase console, your project, **Project settings**, **Your apps**, add an Android app with package name `app.outage` (skip the optional steps).
2. Download `google-services.json` from that page.
3. Put it at exactly `apps/android/app/google-services.json`. Git ignores it. The build applies the Google services plugin only when the file is there.
4. For the GitHub build, store the file as a repository secret instead: run `base64 -w0 google-services.json` and save the output as the Actions secret `FIREBASE_CONFIG_B64`. The `app` job in `.github/workflows/android.yml` decodes it to `apps/android/app/google-services.json` before the Gradle build.

Without the file the app still builds and runs. Push registration is off, following an area shows "Push is not set up on this build", and Light Alarm, Test Light Alarm and the Alarm check work fully offline. Decision record: `docs/adr/0036-firebase-messaging-on-the-phone.md`.

## If something goes wrong

- **"No workers.dev URL"**: do step 3, then run again.
- **Authentication error**: the token is wrong or limited to a different account. Make a new one in step 1 and replace the GitHub secret.
- **Smoke check fails**: open the Worker in the dashboard, then **Logs**, and look at the error.
- **Do not delete the Worker.** `INSTALL_TOKEN_SECRET` lives only there. If it is lost, every install needs a new token.

Decision record: `docs/adr/0021-worker-deploy-and-secret-bootstrap.md`.
