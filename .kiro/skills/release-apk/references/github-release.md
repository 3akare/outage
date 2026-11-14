# GitHub release with `gh api`

The release workflow creates a draft release with the APK attached (see `gradle-release.md`). Use this file to publish that draft after the smoke test, or as a manual fallback if the workflow is unavailable.

In this sandbox `gh pr` and `gh issue` subcommands fail (they use GraphQL); use REST endpoints through `gh api`. Replace `OWNER/REPO` with the repository (`3akare/outage`). Ask the human before publishing.

```bash
VERSION=0.2.0
TAG=v$VERSION
APK=/tmp/outage-$VERSION.apk

# 1. create a DRAFT release for the tag on main (prerelease while in the field test)
ID=$(gh api repos/OWNER/REPO/releases \
  -f tag_name="$TAG" -f target_commitish=main \
  -f name="Outage $VERSION" -f body="Android APK. SHA-256: $(sha256sum "$APK" | cut -d' ' -f1)" \
  -F draft=true -F prerelease=true --jq .id)

# 2. upload the APK as an asset (asset upload goes to uploads.github.com)
gh api --method POST \
  -H "Content-Type: application/vnd.android.package-archive" \
  "https://uploads.github.com/repos/OWNER/REPO/releases/$ID/assets?name=outage-$VERSION.apk" \
  --input "$APK" --jq '.browser_download_url'

# 3. after the smoke test passes: publish
gh api --method PATCH repos/OWNER/REPO/releases/$ID -F draft=false -F prerelease=false
```

Direct link for the install page: `https://github.com/OWNER/REPO/releases/download/$TAG/outage-$VERSION.apk`.

Rules:
- Keep the release a draft until the phone test passes. Delete a bad draft with `gh api --method DELETE repos/OWNER/REPO/releases/$ID` (ask first).
- Put the SHA-256 in the release body so a reader can check the download.
- The APK is a release asset only. It is never committed (`*.apk` is gitignored).
- The repository must be public for the link to work without a login (brief, Part J).
- Confirm the endpoints with the GitHub REST docs (https://docs.github.com/en/rest/releases) if any call fails.
