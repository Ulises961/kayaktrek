# Android dev cheatsheet

Local Android SDK setup, cmdline-tools only (no Android Studio), installed 2026-09-04 for M9
mobile work. `ANDROID_HOME=~/Android/Sdk`, on `PATH` via `~/.bashrc` — open a new terminal (or
`source ~/.bashrc`) to pick it up.

AVD created: `kayak_test` (Pixel 7, Android 15 / API 35, x86_64, Google APIs — no Play Store,
keeps it lighter). List/manage more with `avdmanager`.

## Daily loop

```bash
# 1. Backend running (from the main checkout, not a worktree)
cd /home/ulises/Documents/Programming/Kayak-expedition-planner
docker compose up -d

# 2. Start the emulator (leave running in its own terminal/tab)
emulator -avd kayak_test

# 3. From mobile/ (whichever worktree has the branch you're testing)
pnpm start
# then press 'a' to launch on the running emulator
```

`pnpm start` alone (Metro + Expo Go protocol) is enough for JS-only changes. The moment a native
module is added (MapLibre, BLE, etc. — WP3 onward) `expo run:android` is what you need instead —
it builds a real dev client APK, installs it, and starts Metro:

```bash
cd mobile
pnpm exec expo run:android    # first run: builds native code, slow (minutes). Installs + launches.
```

After that first native build, `pnpm start` + pressing `a` reuses the installed dev client — you
only need `expo run:android` again when a native dependency changes.

## Emulator

```bash
emulator -list-avds                       # see what AVDs exist
emulator -avd kayak_test                  # start with a window
emulator -avd kayak_test -no-window       # headless (CI-style, or low-resource runs)
adb devices                               # confirm it's visible ("emulator-5554  device")
adb -s emulator-5554 shell getprop sys.boot_completed   # "1" once fully booted
```

Kill it: close the emulator window, or `adb -s emulator-5554 emu kill`.

## Build

```bash
cd mobile

pnpm exec expo run:android                # debug build + install + launch on a running emulator/device
pnpm exec expo run:android --device       # prompts to pick a device if more than one is attached

# A real installable .apk (debug, unsigned release, or a proper release build) needs a native
# project — `expo prebuild` generates android/ if it doesn't exist yet, then it's a normal
# Gradle project:
pnpm exec expo prebuild --platform android   # one-time (or after a config plugin changes)
cd android
./gradlew assembleDebug                      # -> android/app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease                    # unsigned release build (needs a signing config for a real release)
```

Prefer EAS for anything beyond local debug testing (release signing, Play Store artifacts) —
see `docs/mobile/` / `plans/M9a.md` for the EAS profile setup once it exists.

## Install / logs / debug

```bash
adb install -r path/to/app-debug.apk       # sideload a built APK (-r = replace existing)
adb logcat                                  # full device log firehose
adb logcat *:S ReactNative:V ReactNativeJS:V   # just RN's own console.log output
adb shell pm list packages | grep kayak    # confirm what's actually installed
adb uninstall <package.name>               # e.g. com.anonymous.mobile — check app.json for the real id
```

## Common gotchas

- **`adb: no devices/emulators found`** — the emulator hasn't finished booting yet, or you closed
  it. `adb devices` should list `emulator-5554  device` (not `offline`).
- **API URL**: `mobile/.env` (`cp .env.example .env`) needs `EXPO_PUBLIC_API_URL=http://10.0.2.2:5000`
  for the emulator specifically — `10.0.2.2` is the emulator's alias for the host machine's
  `localhost`. A physical phone instead needs your machine's real LAN IP.
- **SSE URL** (live trip-change notifications, M36): the same file needs
  `EXPO_PUBLIC_SSE_URL=http://10.0.2.2:5001` on the emulator, for the same reason. Without it the
  app still works — screens simply don't refresh when someone else edits the trip.
- **Metro cache acting weird after a native/config change**: `pnpm exec expo start -c` clears it.
- **Emulator slow to boot the first time**: normal, it's a cold boot of the whole system image.
  Subsequent boots are much faster (snapshot resume) unless you `-no-snapshot-save`.
- **Multiple worktrees, one emulator**: the emulator is a machine-level resource, not tied to a
  git worktree — whichever worktree's `mobile/` you run `pnpm start`/`expo run:android` from is
  what gets installed. Only one branch's build lives on the emulator at a time; reinstalling from
  a different worktree replaces it.
