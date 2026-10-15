"""Poll the harness sidecar like N open trip pages would, and report what it costs.

Each viewer polls GET .../changes?since=<rev> every INTERVAL seconds (jittered, over one
keep-alive connection) for a stage's duration, while a publisher commits one change per trip
every few seconds so some polls return something. Prints requests per second, latency
percentiles, errors, and the sidecar worker's CPU, resident memory and open descriptors.

    load_client.py <port> <gunicorn master pid> <viewers, e.g. 100,300,600> <trips>
                   <poll interval seconds> <seconds per stage> <env file>

The env file is read by python-dotenv only to find LIVE_REDIS_URL; nothing from it is printed.
See harness_sidecar.py for how to start the sidecar this talks to.
"""
from gevent import monkey

monkey.patch_all()

import http.client  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import random  # noqa: E402
import sys  # noqa: E402
import time  # noqa: E402
import urllib.request  # noqa: E402
import uuid  # noqa: E402

import gevent  # noqa: E402
import redis  # noqa: E402
from dotenv import load_dotenv  # noqa: E402

sys.path.insert(0, os.getcwd())  # run from backend/, so the real publisher can be imported
from Services.trip_change_service import TripChange, TripChangeService  # noqa: E402

PORT = int(sys.argv[1])
MASTER_PID = int(sys.argv[2])
STAGES = [int(part) for part in sys.argv[3].split(",")]
TRIPS = int(sys.argv[4])
INTERVAL = float(sys.argv[5])
STAGE_SECONDS = float(sys.argv[6])
BACKEND_ENV = sys.argv[7]
PUBLISH_EVERY_SECONDS = 5

load_dotenv(BACKEND_ENV)
redis_client = redis.Redis.from_url(os.getenv("LIVE_REDIS_URL", "redis://localhost:6379/3"), decode_responses=True)

trip_ids = [uuid.uuid4() for _ in range(TRIPS)]
tickets = {}
for trip_id in trip_ids:
    with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/__ticket/{trip_id}") as response:
        tickets[trip_id] = response.read().decode()


def worker_pid() -> int:
    with open(f"/proc/{MASTER_PID}/task/{MASTER_PID}/children") as handle:
        return int(handle.read().split()[0])


def cpu_seconds(pid: int) -> float:
    with open(f"/proc/{pid}/stat") as handle:
        fields = handle.read().rsplit(")", 1)[1].split()
    return (int(fields[11]) + int(fields[12])) / os.sysconf("SC_CLK_TCK")


def rss_mib(pid: int) -> float:
    with open(f"/proc/{pid}/status") as handle:
        for line in handle:
            if line.startswith("VmRSS"):
                return int(line.split()[1]) / 1024
    return 0.0


def open_descriptors(pid: int) -> int:
    return len(os.listdir(f"/proc/{pid}/fd"))


class Stage:
    def __init__(self):
        self.latencies: list[float] = []
        self.errors = 0
        self.with_changes = 0
        self.running = True


def viewer(trip_id: uuid.UUID, stage: Stage) -> None:
    # A new connection per poll, as nginx makes to the sidecar: its upstream has no keepalive,
    # and gunicorn closes an idle one after two seconds anyway.
    since = None
    gevent.sleep(random.random() * INTERVAL)
    while stage.running:
        query = f"ticket={tickets[trip_id]}" + (f"&since={since}" if since is not None else "")
        connection = http.client.HTTPConnection("127.0.0.1", PORT, timeout=30)
        started = time.monotonic()
        try:
            connection.request("GET", f"/api/v1/live/trip/{trip_id}/changes?{query}", headers={"Connection": "close"})
            response = connection.getresponse()
            body = response.read()
            stage.latencies.append((time.monotonic() - started) * 1000)
            if response.status != 200:
                stage.errors += 1
            else:
                page = json.loads(body)
                since = page["rev"]
                stage.with_changes += bool(page["changes"])
        except Exception:  # noqa: BLE001
            stage.errors += 1
        finally:
            connection.close()
        gevent.sleep(INTERVAL * (0.8 + random.random() * 0.4))


def publisher(stage: Stage) -> None:
    while stage.running:
        for trip_id in trip_ids:
            TripChangeService.publish(trip_id, [TripChange("point", uuid.uuid4(), "update")])
        gevent.sleep(PUBLISH_EVERY_SECONDS)


def percentile(sorted_values: list[float], fraction: float) -> float:
    return sorted_values[min(len(sorted_values) - 1, int(len(sorted_values) * fraction))] if sorted_values else 0.0


pid = worker_pid()
print(f"worker pid {pid}  baseline RSS {rss_mib(pid):.1f} MiB  poll every {INTERVAL:g}s  {TRIPS} trips")
print(
    f"{'viewers':>8} {'req/s':>7} {'p50 ms':>7} {'p95 ms':>7} {'p99 ms':>7} {'errors':>6} "
    f"{'w/ data':>7} {'CPU %':>6} {'RSS MiB':>8} {'fds':>5}"
)

for count in STAGES:
    stage = Stage()
    cpu_before, wall_before = cpu_seconds(pid), time.monotonic()
    greenlets = [gevent.spawn(viewer, trip_ids[index % TRIPS], stage) for index in range(count)]
    greenlets.append(gevent.spawn(publisher, stage))
    gevent.sleep(STAGE_SECONDS)
    stage.running = False
    elapsed = time.monotonic() - wall_before
    cpu_percent = (cpu_seconds(pid) - cpu_before) / elapsed * 100
    gevent.joinall(greenlets, timeout=INTERVAL * 2)
    latencies = sorted(stage.latencies)
    print(
        f"{count:>8} {len(latencies) / elapsed:>7.1f} {percentile(latencies, 0.5):>7.1f} "
        f"{percentile(latencies, 0.95):>7.1f} {percentile(latencies, 0.99):>7.1f} {stage.errors:>6} "
        f"{stage.with_changes:>7} {cpu_percent:>6.1f} {rss_mib(pid):>8.1f} {open_descriptors(pid):>5}"
    )
    sys.stdout.flush()

for trip_id in trip_ids:
    redis_client.delete(f"trip:{trip_id}:rev", f"trip:{trip_id}:log")
