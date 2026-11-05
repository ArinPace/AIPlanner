#!/usr/bin/env python3
"""Install authored file fixtures into a simulator's debug app cache.

Run after installing the debug app, before opting into the live relay tests.
Does not read or modify authentication, calendar data or website sessions.
"""
import base64
import json
from pathlib import Path
import subprocess
import sys

device = sys.argv[1] if len(sys.argv) > 1 else "booted"
root = Path(subprocess.check_output([
    "xcrun", "simctl", "get_app_container", device,
    "com.arinpace.aiplanner", "data",
], text=True).strip())
fixtures = Path(__file__).resolve().parents[1] / "ios/AIPlannerUITests/Fixtures/Relay"
mime = {
    "csv": "text/csv", "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "png": "image/png", "zip": "application/zip", "txt": "text/plain",
}
for group, extensions in {"documents": ["csv", "pdf", "docx", "xlsx"], "media": ["png", "zip", "txt"]}.items():
    files = [{"name": f"verification.{ext}", "mime": mime[ext],
              "data": base64.b64encode((fixtures / f"verification.{ext}").read_bytes()).decode()}
             for ext in extensions]
    target = root / "Library/Caches" / f"RelayFileMatrix-{group}.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(files))
    print(f"Installed {group} fixtures ({len(files)} files)")
