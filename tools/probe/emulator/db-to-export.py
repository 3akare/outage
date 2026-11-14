#!/usr/bin/env python3
"""Turn the probe's SQLite log (pulled from the emulator) into the contract export (tools/probe/contract/README.md)."""
import json, re, sqlite3, sys

db, getprop, alias, out = sys.argv[1:5]
props = dict(re.findall(r"\[([^\]]+)\]: \[([^\]]*)\]", open(getprop).read()))
con = sqlite3.connect(db)
rows = [
    {"id": i, "kind": k, "monoMs": m, "wallMs": w, "bootCount": b, "fields": json.loads(f)}
    for i, k, m, w, b, f in con.execute("SELECT id, kind, mono_ms, wall_ms, boot_count, fields_json FROM log ORDER BY id")
]
device = {"alias": alias, "maker": props.get("ro.product.manufacturer", "")[:40], "brand": props.get("ro.product.brand", "")[:40],
          "androidSdk": int(props.get("ro.build.version.sdk", "0"))}
json.dump({"version": 1, "devices": [{"device": device, "rows": rows}]}, open(out, "w"), indent=1)
print(f"{len(rows)} rows from {device['maker']} SDK {device['androidSdk']}")
