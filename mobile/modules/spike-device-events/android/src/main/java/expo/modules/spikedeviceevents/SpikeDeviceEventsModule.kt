package expo.modules.spikedeviceevents

import android.app.usage.UsageStatsManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject
import java.io.File

// M9e WP0 spike (plans/M9e.md): writes what the phone itself is doing (screen on or off, deep sleep,
// battery saver, battery level) to a file, from native code, so the record is complete even while the
// JavaScript runtime is paused or frozen. Throwaway with the rest of the spike.
class SpikeDeviceEventsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SpikeDeviceEvents")

    // Starts the log. Calling it again only updates the path: one receiver per process, ever.
    Function("start") { path: String ->
      DeviceEventLog.start(requireContext(), path)
    }

    Function("snapshot") {
      DeviceEventLog.snapshot(requireContext())
    }
  }

  private fun requireContext(): Context =
    appContext.reactContext?.applicationContext ?: throw IllegalStateException("No application context")
}

object DeviceEventLog {
  private var receiver: BroadcastReceiver? = null
  private var path: String? = null
  private var lastLevel = -1
  private var lastCharging: Boolean? = null

  @Synchronized
  fun start(context: Context, path: String) {
    this.path = path
    if (receiver != null) return

    val filter = IntentFilter().apply {
      addAction(Intent.ACTION_SCREEN_ON)
      addAction(Intent.ACTION_SCREEN_OFF)
      addAction(Intent.ACTION_USER_PRESENT)
      addAction(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED)
      addAction(PowerManager.ACTION_DEVICE_IDLE_MODE_CHANGED)
      addAction(Intent.ACTION_BATTERY_CHANGED)
    }
    val created = object : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent) {
        handle(context, intent)
      }
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.registerReceiver(created, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      context.registerReceiver(created, filter)
    }
    receiver = created

    // The state as it is right now, so that a run starting later knows what the phone was doing before.
    val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    write(event("screen").put("on", power.isInteractive))
    write(event("doze").put("idle", power.isDeviceIdleMode))
    write(event("powersave").put("on", power.isPowerSaveMode))
    context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))?.let { noteBattery(it) }
  }

  private fun handle(context: Context, intent: Intent) {
    val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    when (intent.action) {
      Intent.ACTION_SCREEN_ON -> write(event("screen").put("on", true))
      Intent.ACTION_SCREEN_OFF -> write(event("screen").put("on", false))
      Intent.ACTION_USER_PRESENT -> write(event("unlock"))
      PowerManager.ACTION_POWER_SAVE_MODE_CHANGED -> write(event("powersave").put("on", power.isPowerSaveMode))
      PowerManager.ACTION_DEVICE_IDLE_MODE_CHANGED -> write(event("doze").put("idle", power.isDeviceIdleMode))
      Intent.ACTION_BATTERY_CHANGED -> noteBattery(intent)
    }
  }

  // The battery broadcast fires on every wobble of voltage and temperature; only a change of level or of
  // charging state is worth a line.
  @Synchronized
  private fun noteBattery(intent: Intent) {
    val level = batteryPercent(intent)
    val charging = isCharging(intent)
    if (level == lastLevel && charging == lastCharging) return
    lastLevel = level
    lastCharging = charging
    write(event("battery").put("level", level).put("charging", charging))
  }

  private fun batteryPercent(intent: Intent): Int {
    val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
    val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, 100)
    return if (level < 0 || scale <= 0) -1 else level * 100 / scale
  }

  private fun isCharging(intent: Intent): Boolean {
    val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
    return status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL
  }

  fun snapshot(context: Context): Map<String, Any?> {
    val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    val battery = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
    val bucket = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      (context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager).appStandbyBucket
    } else {
      null
    }
    return mapOf(
      "interactive" to power.isInteractive,
      "idle" to power.isDeviceIdleMode,
      "powerSave" to power.isPowerSaveMode,
      "ignoringBatteryOptimizations" to power.isIgnoringBatteryOptimizations(context.packageName),
      "standbyBucket" to bucket,
      "battery" to (battery?.let { batteryPercent(it) } ?: -1),
      "charging" to (battery?.let { isCharging(it) } ?: false),
      "sdk" to Build.VERSION.SDK_INT,
      "manufacturer" to Build.MANUFACTURER,
      "model" to Build.MODEL,
    )
  }

  private fun event(kind: String): JSONObject =
    JSONObject().put("ev", kind).put("t", System.currentTimeMillis())

  @Synchronized
  private fun write(line: JSONObject) {
    val target = path ?: return
    try {
      File(target).appendText(line.toString() + "\n")
    } catch (_: Exception) {
      // Nothing to do: a log that cannot be written must not take the app down with it.
    }
  }
}
