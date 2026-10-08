"""Hold N trip-changes streams open against the harness sidecar and report what it costs.

For each stage it opens connections up to the stage's total, lets them settle, publishes one
change per trip and counts how many viewers received it, then samples the sidecar worker's
resident memory and the Redis server's connected-client count. Prints numbers only.

    load_client.py <port> <gunicorn master pid> <stages, e.g. 100,300,600,1000> <trips> <env file>

The env file is read by python-dotenv only to find LIVE_REDIS_URL; nothing from it is printed.
A viewer that was answered 200 but never received `hello` is listed with the bytes it did get
— that is how the Redis-pool exhaustion in plans/M36 "Capacity, measured" was found. See
harness_sidecar.py for how to start the sidecar this talks to.
"""
from gevent import monkey

monkey.patch_all()

import json  # noqa: E402
import os  # noqa: E402
import sys  # noqa: E402
import time  # noqa: E402
import urllib.request  # noqa: E402
import uuid  # noqa: E402

import gevent  # noqa: E402
import redis  # noqa: E402
from dotenv import load_dotenv  # noqa: E402

PORT = int(sys.argv[1])
MASTER_PID = int(sys.argv[2])
STAGES = [int(part) for part in sys.argv[3].split(",")]
TRIPS = int(sys.argv[4])
BACKEND_ENV = sys.argv[5]

load_dotenv(BACKEND_ENV)
redis_client = redis.Redis.from_url(os.getenv("LIVE_REDIS_URL", "redis://localhost:6379/3"), decode_responses=True)

trip_ids = [str(uuid.uuid4()) for _ in range(TRIPS)]
tickets = {}
for trip_id in trip_ids:
    with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/__ticket/{trip_id}") as response:
        tickets[trip_id] = response.read().decode()


def worker_pid() -> int:
    with open(f"/proc/{MASTER_PID}/task/{MASTER_PID}/children") as handle:
        return int(handle.read().split()[0])


def memory_kib(pid: int) -> dict:
    values = {}
    with open(f"/proc/{pid}/status") as handle:
        for line in handle:
            if line.startswith(("VmRSS", "VmHWM")):
                key, value = line.split(":")
                values[key] = int(value.split()[0])
    return values


def open_descriptors(pid: int) -> int:
    return len(os.listdir(f"/proc/{pid}/fd"))


class Viewer:
    def __init__(self, trip_id: str) -> None:
        self.trip_id = trip_id
        self.status = None
        self.hello = False
        self.changes = 0
        self.error = None
        self.socket = None
        self.raw = b""

    def run(self) -> None:
        import socket

        try:
            self.socket = socket.create_connection(("127.0.0.1", PORT), timeout=30)
            request = (
                f"GET /api/v1/live/trip/{self.trip_id}/changes?ticket={tickets[self.trip_id]} HTTP/1.1\r\n"
                f"Host: 127.0.0.1\r\nAccept: text/event-stream\r\n\r\n"
            )
            self.socket.sendall(request.encode())
            self.socket.settimeout(None)
            buffer = b""
            while True:
                chunk = self.socket.recv(4096)
                if not chunk:
                    break
                buffer += chunk
                if len(self.raw) < 600:
                    self.raw += chunk
                if self.status is None and b"\r\n" in buffer:
                    self.status = int(buffer.split(b" ", 2)[1])
                self.hello = self.hello or b"event: hello" in buffer
                self.changes += buffer.count(b"event: change")
                buffer = buffer[-32:]  # keep a tail so a marker split across reads is not lost
        except Exception as error:  # noqa: BLE001
            self.error = type(error).__name__


def redis_clients() -> int:
    return int(redis_client.info("clients")["connected_clients"])


viewers: list[Viewer] = []
greenlets = []
pid = worker_pid()
baseline_clients = redis_clients()
baseline = memory_kib(pid)
print(f"worker pid {pid}  baseline RSS {baseline['VmRSS'] / 1024:.1f} MiB  redis clients {baseline_clients}")
print(f"{'viewers':>8} {'trips':>5} {'hello':>6} {'503':>5} {'err':>4} {'RSS MiB':>8} {'KiB/conn':>9} {'fds':>5} {'redis +':>8} {'delivered':>10}")

for stage in STAGES:
    while len(viewers) < stage:
        viewer = Viewer(trip_ids[len(viewers) % TRIPS])
        viewers.append(viewer)
        greenlets.append(gevent.spawn(viewer.run))
        if len(viewers) % 25 == 0:
            gevent.sleep(0.05)
    gevent.sleep(3)

    for viewer in viewers:
        viewer.changes = 0
    for trip_id in trip_ids:
        redis_client.publish(f"trip:{trip_id}:changes", json.dumps({"rev": 1, "changes": [{"t": "point", "id": "x", "op": "update"}]}))
    gevent.sleep(2)

    live = [viewer for viewer in viewers if viewer.status == 200]
    delivered = sum(1 for viewer in live if viewer.changes >= 1)
    refused = sum(1 for viewer in viewers if viewer.status == 503)
    errors = sum(1 for viewer in viewers if viewer.error)
    memory = memory_kib(pid)
    per_connection = (memory["VmRSS"] - baseline["VmRSS"]) / max(1, len(live))
    print(
        f"{len(viewers):>8} {TRIPS:>5} {sum(v.hello for v in viewers):>6} {refused:>5} {errors:>4} "
        f"{memory['VmRSS'] / 1024:>8.1f} {per_connection:>9.1f} {open_descriptors(pid):>5} "
        f"{redis_clients() - baseline_clients:>8} {delivered:>5}/{len(live):<4}"
    )
    sys.stdout.flush()

for index, viewer in enumerate(viewers):
    if viewer.status == 200 and not viewer.hello:
        print("NO HELLO: viewer", index, "trip", viewer.trip_id[:8], "raw:", viewer.raw[-220:])
print(f"peak RSS (VmHWM) {memory_kib(pid)['VmHWM'] / 1024:.1f} MiB")
for viewer in viewers:
    if viewer.socket:
        viewer.socket.close()
gevent.sleep(1)
print(f"after closing everything: RSS {memory_kib(pid)['VmRSS'] / 1024:.1f} MiB  redis +{redis_clients() - baseline_clients}")
