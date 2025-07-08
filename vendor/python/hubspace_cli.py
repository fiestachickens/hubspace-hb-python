import json
import sys
from hubspace import Hubspace

hs = None

def send(msg):
    sys.stdout.write(json.dumps(msg) + "\n")
    sys.stdout.flush()

while True:
    try:
        line = sys.stdin.readline()
        if not line:
            break
        data = json.loads(line.strip())

        cmd = data.get("command")
        if cmd == "login":
            hs = Hubspace(data["email"], data["password"])
            send({ "status": "ok" })
        elif cmd == "get_devices":
            send({ "devices": hs.get_devices() })
        elif cmd == "set_device_state":
            hs.set_device_state(data["device_id"], data["state"])
            send({ "status": "ok" })
        else:
            send({ "error": "unknown command" })
    except Exception as e:
        send({ "error": str(e) })
