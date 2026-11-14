#!/usr/bin/env bash
# Build Android code inside the Kiro Web sandbox. ADR 0012.
#   .kiro/scripts/android-sandbox.sh setup            install SDK 36 and build-tools 36.0.0 (once, about 400 MB)
#   .kiro/scripts/android-sandbox.sh gradle <dir> ... run ./gradlew in <dir> with the sandbox environment
# Example: .kiro/scripts/android-sandbox.sh gradle tools/probe/android :app:assembleDebug :app:testDebugUnitTest :app:lintDebug
#
# Why the extra environment (found by running it, 2026-11-14):
#  - /tmp is cleared between commands and /root is read-only, so everything lives in /projects/sandbox/.toolchain (outside the repo).
#  - Java and the SDK manager write caches under user.home and ~/.android, so both point at the toolchain folder (without this sdkmanager fails with "IO exception while downloading manifest").
set -euo pipefail
T="${OUTAGE_TOOLCHAIN:-/projects/sandbox/.toolchain}"
export HOME="$T/home" ANDROID_HOME="$T/android" ANDROID_USER_HOME="$T/home/.android" GRADLE_USER_HOME="$T/gh"
export JAVA_TOOL_OPTIONS="-Duser.home=$T/home"
mkdir -p "$HOME" "$ANDROID_USER_HOME" "$GRADLE_USER_HOME"

setup() {
  mkdir -p "$ANDROID_HOME/cmdline-tools"
  if [ ! -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]; then
    curl -fsSL -o "$T/cmd.zip" https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
    unzip -q -o "$T/cmd.zip" -d "$ANDROID_HOME/cmdline-tools" && rm -rf "$ANDROID_HOME/cmdline-tools/latest"
    mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest" && rm "$T/cmd.zip"
  fi
  (yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --sdk_root="$ANDROID_HOME" --licenses >/dev/null 2>&1) || true
  "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --sdk_root="$ANDROID_HOME" "platforms;android-36" "build-tools;36.0.0"
  echo "ready: $ANDROID_HOME"
}

gradle_run() {
  local dir="$1"; shift
  [ -d "$ANDROID_HOME/platforms/android-36" ] || { echo "SDK missing: run setup first" >&2; exit 2; }
  echo "sdk.dir=$ANDROID_HOME" > "$dir/local.properties"   # git-ignored
  (cd "$dir" && ./gradlew --no-daemon "$@")
}

case "${1:-}" in
  setup) setup ;;
  gradle) shift; gradle_run "$@" ;;
  *) sed -n 2,7p "$0"; exit 1 ;;
esac
