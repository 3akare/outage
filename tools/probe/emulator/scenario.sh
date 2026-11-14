#!/usr/bin/env bash
# Scripted probe run on an Android emulator (feasibility-probe, ADR 0013 decision 3). Fakes the charger with
# `dumpsys battery` (https://developer.android.com/topic/performance/power/test-power) and Doze with `deviceidle`
# (https://developer.android.com/training/monitoring-device-state/doze-standby). Stock Android only: no maker battery manager.
# Usage: scenario.sh <apk> <out dir> [scale]   scale 1 = about 2 hours; 0.1 = a quick smoke run.
set -euo pipefail
APK="$1"; OUT="$2"; SCALE="${3:-1}"
PKG=app.outage.probe
mkdir -p "$OUT"
sec() { python3 -c "import sys; print(max(1, round(float(sys.argv[1]) * float(sys.argv[2]))))" "$1" "$SCALE"; }
say() { echo "[$(date -u +%H:%M:%S)] $*"; }
# The emulator's simulated battery hardware (emulator console `power`), so the system, and JobScheduler, see a charger.
# First run used `dumpsys battery set`: apps saw AC, but JobScheduler never counted the phone as charging.
LEVEL=40; CAP=89
level() { LEVEL=$1; adb emu power capacity "$LEVEL" >/dev/null; }
plug() { adb emu power ac on >/dev/null; adb emu power status charging >/dev/null; }
unplug() { adb emu power ac off >/dev/null; adb emu power status discharging >/dev/null; }
# A real charger raises the level: +1% every 30 s, never above CAP.
charge_for() { local end=$(( $(date +%s) + $1 )); while [ "$(date +%s)" -lt "$end" ]; do sleep 30; [ "$LEVEL" -lt "$CAP" ] && level $(( LEVEL + 1 )); done; }
state() { adb shell dumpsys jobscheduler | grep -E 'Power connected|Battery charging|Considered charging|Battery level' | tr -s ' ' | tr '\n' ' '; echo; }
# After any scripted tap: go home and turn the screen off, so the app is not the visible app during measurement.
away() { adb shell input keyevent KEYCODE_HOME; adb shell input keyevent KEYCODE_SLEEP; }
note() { adb shell am start --activity-single-top -n $PKG/.MainActivity --es probe.note "'$1'" >/dev/null; sleep 2; away; }
replugs() { # <count> <level>: unplug 20 s, plug, charge 40 s; the level is reset before each plug-in
  for i in $(seq 1 "$1"); do unplug; sleep "$(sec 20)"; level "$2"; plug; charge_for "$(sec 40)"; done; }

say "install"
adb install -r -g "$APK"
level 40; plug
adb shell am start -n $PKG/.MainActivity --es probe.alias emu-api35 --ez probe.reference true --ez probe.start true >/dev/null
sleep 10; away

say "phase 1: one long charge from 40% that never reaches 90% (M1, M5)"
note "cond: emu-long-below-90"
sleep 60; say "1 min after plug-in: $(state)" | tee "$OUT/charging-state.txt"
CAP=89; charge_for "$(sec 2700)"
say "end of phase 1: $(state)" | tee -a "$OUT/charging-state.txt"

say "phase 2: 10 plug-ins at 55%, then 10 at 92% (M2, M6; tests the 90% observation)"
note "cond: emu-replug-55"
CAP=60; replugs 10 55
say "after replugs at 55%: $(state)" | tee -a "$OUT/charging-state.txt"
note "cond: emu-replug-92"
CAP=95; replugs 10 92
say "after replugs at 92%: $(state)" | tee -a "$OUT/charging-state.txt"

say "phase 3: 5 plug-ins after forced Doze, at 92% (M10)"
note "cond: emu-doze-92"
for i in $(seq 1 5); do
  unplug; sleep 2; adb shell dumpsys deviceidle force-idle || true
  sleep "$(sec 120)"; level 92; plug; adb shell dumpsys deviceidle unforce || true; charge_for "$(sec 60)"
done

say "phase 4: battery exemption on, long charge from 50% (M4)"
adb shell dumpsys deviceidle whitelist +$PKG
note "cond: emu-exempt-below-90"
level 50; CAP=89; charge_for "$(sec 1800)"

say "phase 5: alarm test on a plug-in at 93% (M9)"
adb shell am start --activity-single-top -n $PKG/.MainActivity --ez probe.alarm true >/dev/null
sleep 5; away; unplug; sleep 10; level 93; plug; sleep 30

say "collect"
unplug; sleep 3
adb shell dumpsys jobscheduler > "$OUT/dumpsys-jobscheduler.txt" || true
for f in probe.db probe.db-wal probe.db-shm; do adb exec-out run-as $PKG cat databases/$f > "$OUT/$f" 2>/dev/null || rm -f "$OUT/$f"; done
adb shell getprop > "$OUT/getprop.txt"
adb logcat -d > "$OUT/logcat.txt" || true
say "done"
