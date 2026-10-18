# M9e WP0 spike — does sharing survive a locked screen?

Throwaway. Lives on `spike/m9e-location-survival` and is deleted (or becomes WP1's base) once
`plans/M9e.md` WP0 has its answers. Nothing on this branch is meant to merge as it stands.

## What the source already tells us (expo-location ~57.0.21, `LocationModule.kt`)

`startLocationUpdatesAsync` with a `foregroundService` option **does not require background
location permission** ("a user-initiated foreground service with notification"), but it refuses to
start unless the app is in the foreground at that moment, and it needs `FOREGROUND_SERVICE` plus
`FOREGROUND_SERVICE_LOCATION`. `app.json` therefore enables the foreground service and leaves
`ACCESS_BACKGROUND_LOCATION` **off**. This is read from source, not yet observed: the test below
is what confirms that "While using the app" is enough with the screen locked.

## What the first two builds found (2026-10-18, on the Mi 8)

Both crashed on the first location fix, nine times in a row. `expo-task-manager` hands every fix to
the app through a **persisted** `JobScheduler` job (`TaskManagerUtils.java`, `setPersisted(true)`),
Android only lets an app persist jobs if it holds `RECEIVE_BOOT_COMPLETED`, and the library neither
declares it nor catches the `IllegalArgumentException` (it only catches `IllegalStateException`).

- Declaring the permission in `app.json` was **not** enough on this phone: it showed as granted and
  the same exception was thrown. MIUI keeps its own "Autostart" switch (`MIUIOP(10008)`, "ignore" by
  default), and the check follows it. Setting that op to allow over adb did not stop the crash either.
- So the library is patched instead (`patches/expo-task-manager@57.0.21.patch`, applied by pnpm):
  `setPersisted(false)`. A position fix is worth nothing after a reboot, and without the permission
  the boot broadcast is never delivered, so a location task cannot come back by itself when the phone
  restarts. The permission is **not** declared. Production needs a decision (keep the patch, send it
  upstream, or use another mechanism); that belongs to WP1, not this spike.

## Build and install

The build needs no phone. Only putting the APK on the phone needs a cable, once; the test itself
needs neither a cable nor adb: permission, start, stop and the results are all in the app.

```bash
cd mobile
pnpm exec expo prebuild --platform android --no-install   # applies the config plugins to android/
#   prebuild regenerates android/ and RESETS gradle.properties: set
#   reactNativeArchitectures=arm64-v8a again (the Mi 8; four ABIs took 31 minutes)
cd android
EXPO_PUBLIC_API_URL=https://api.kayaktrek.app EXPO_PUBLIC_SSE_URL=https://live.kayaktrek.app \
  ./gradlew assembleRelease
# -> android/app/build/outputs/apk/release/app-release.apk
```

Both URLs are needed: a release build crashes on launch if either is unset (the first attempt did,
on `EXPO_PUBLIC_SSE_URL`). The values are the repo's Actions variables. If you rebuild after only a
JS change, delete `android/app/build/generated/assets/react/release` first. `expo run:android` is
avoided on purpose: with no phone attached it can start an emulator.

Release, not debug: a debug build's JS comes from Metro, which is not there on a walk.

Install: `adb install -r app-release.apk` with the phone attached (or copy the file across and open
it). The app is a release build pointed at production, so the normal screens ask for a login; the
spike screen does not. Reach it from the small **spike** link at the bottom-left of any screen.

Tap **Ask for location permission** and choose **While using the app** (not "Allow all the time").

## Runs

For each run: pick the settings, tap **Start**, note the battery % and the time, lock the phone,
put it in a pocket (the dry bag for run C), **do not open the app**, and walk for at least 30
minutes. Then open the app and read the numbers on screen; screenshot them.

| Run | Settings | Extra |
| --- | --- | --- |
| A | Balanced, 15 s, 10 m | MIUI defaults, nothing exempted. Learn whether it is killed. |
| B | Balanced, 15 s, no filter | Only if A died. Exempt the app first (below), repeat. |
| C | High, 15 s, 10 m | Battery comparison against A or B. |
| D | Balanced, 15 s, 10 m | Mobile data and wifi off for the whole walk. Then once more in airplane mode. |

MIUI exemptions to try if A fails: Settings → Apps → Manage apps → Kayaktrek → **Autostart** on,
**Battery saver: No restrictions**; and lock the app in the recents screen.

Record per run: settings, start and end battery %, duration, fixes logged, median and longest gap,
gaps over three intervals, worst delivery delay, **how many times the app process started** (more
than one means Android killed it and something brought it back; the screen says so), and whether
the foreground notification was visible (Android 13+ may hide it without the notification
permission; the spike does not ask). If the app crashes again, say when: the log keeps every fix
that arrived before it.

## Teardown

1. Start, then **Stop** in the app: fixes stop and the notification goes.
2. Start with "survives the app being swiped away" on, swipe the app from recents, wait two
   minutes, reopen: did the count keep rising?
3. Start, then **Force stop** in Android's app settings: reopen and confirm nothing was logged after.

## Answers to write back into `plans/M9e.md` WP0

Survival (A/B), permission set that sufficed, what MIUI needed, battery per hour for each setting,
behaviour with no signal, teardown. Then delete this file.
