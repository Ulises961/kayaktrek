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

## Build and install

Phone connected, USB debugging on, `adb devices` showing it.

```bash
cd mobile
# the Mi 8 is arm64; the default builds four ABIs and the first build took 31 minutes
#   edit android/gradle.properties: reactNativeArchitectures=arm64-v8a
pnpm exec expo prebuild --platform android          # applies the location plugin to android/
EXPO_PUBLIC_API_URL=https://api.kayaktrek.app pnpm exec expo run:android --variant release --no-bundler
```

Release, not debug: a debug build's JS comes from Metro, which is not there on a walk. A release
build cannot be read with `run-as`, which is fine; the screen summarises the log itself.

Open the spike screen (works in release too):

```bash
adb shell am start -a android.intent.action.VIEW -d "kayaktrek:///spike-location"
```

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
gaps over three intervals, worst delivery delay, and whether the foreground notification was
visible (Android 13+ may hide it without the notification permission; the spike does not ask).

## Teardown

1. Start, then **Stop** in the app: fixes stop and the notification goes.
2. Start with "survives the app being swiped away" on, swipe the app from recents, wait two
   minutes, reopen: did the count keep rising?
3. Start, then **Force stop** in Android's app settings: reopen and confirm nothing was logged after.

## Answers to write back into `plans/M9e.md` WP0

Survival (A/B), permission set that sufficed, what MIUI needed, battery per hour for each setting,
behaviour with no signal, teardown. Then delete this file.
