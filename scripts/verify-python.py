#!/usr/bin/env python3
"""
Run the Python test suites that belong to `npm run verify` (M22.8): the v2 data adapter tests in
`tools/detector/tests`.

This FAILS, and never skips, when the environment cannot run them:
  - Python older than 3.12;
  - a dependency pinned in `tools/detector/requirements-test.txt` that will not import;
  - a test collection that finds nothing (pytest exit code 5).
It prints what is missing and the install command.

Version pins: a mismatch between an installed version and its pin is reported. Locally it is a
warning, so a developer with a newer patch release still runs the tests and sees the difference. With
PRATIBIMB_STRICT_PY_PINS=1 (set in CI) it is a failure.

The tests run on small synthetic candidates in a temp directory: no dataset folder, no model, no TEST.
"""

import importlib
import os
import re
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
REQUIREMENTS = os.path.join("tools", "detector", "requirements-test.txt")
SUITES = [os.path.join("tools", "detector", "tests")]
MIN_PYTHON = (3, 12)
IMPORT_NAME = {"pillow": "PIL"}


def pins():
    out = []
    with open(os.path.join(ROOT, REQUIREMENTS), "r", encoding="utf-8") as f:
        for line in f:
            m = re.match(r"^\s*([A-Za-z0-9_.-]+)==([^\s#]+)", line)
            if m:
                out.append((m.group(1).lower(), m.group(2)))
    if not out:
        raise SystemExit(f"verify-python: no pinned dependency found in {REQUIREMENTS}")
    return out


def main():
    print(f"verify-python: {sys.executable} (Python {sys.version.split()[0]})")
    if sys.version_info[:2] < MIN_PYTHON:
        print(f"verify-python: FAIL - Python {'.'.join(map(str, MIN_PYTHON))} or newer is required for {', '.join(SUITES)}", file=sys.stderr)
        return 2

    missing, drift = [], []
    for name, want in pins():
        try:
            module = importlib.import_module(IMPORT_NAME.get(name, name))
        except Exception as e:  # ImportError, or a broken native extension
            missing.append(f"{name}=={want} ({type(e).__name__}: {e})")
            continue
        have = getattr(module, "__version__", None)
        if have != want:
            drift.append(f"{name} {have} installed, {want} pinned")
    if missing:
        print("verify-python: FAIL - the Python adapter tests cannot run; missing or broken:", file=sys.stderr)
        for m in missing:
            print(f"  - {m}", file=sys.stderr)
        print(f"  install with: {sys.executable} -m pip install -r {REQUIREMENTS}", file=sys.stderr)
        return 2
    if drift:
        strict = os.environ.get("PRATIBIMB_STRICT_PY_PINS") == "1"
        print(f"verify-python: {'FAIL' if strict else 'WARNING'} - versions differ from {REQUIREMENTS}:", file=sys.stderr)
        for d in drift:
            print(f"  - {d}", file=sys.stderr)
        if strict:
            return 2

    cmd = [sys.executable, "-m", "pytest", *SUITES, "-q", "-p", "no:cacheprovider"]
    print("verify-python: " + " ".join(cmd[1:]))
    code = subprocess.run(cmd, cwd=ROOT, env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}).returncode
    if code == 5:
        print("verify-python: FAIL - pytest collected no tests; a suite that runs nothing is not a pass", file=sys.stderr)
        return 1
    return code


if __name__ == "__main__":
    sys.exit(main())
