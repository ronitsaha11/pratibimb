"""
M22.8 — `scripts/verify-python.py` fails, never skips, when the Python environment cannot run the
adapter tests. Each case returns before pytest would be launched, so nothing recurses.
"""

import importlib.util
import os

import pytest

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))


@pytest.fixture()
def runner():
    spec = importlib.util.spec_from_file_location("verify_python", os.path.join(ROOT, "scripts", "verify-python.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_a_missing_dependency_fails_with_the_install_command(runner, monkeypatch, capsys):
    monkeypatch.setattr(runner, "pins", lambda: [("definitely-not-installed-m22-8", "1.0")])
    assert runner.main() == 2
    err = capsys.readouterr().err
    assert "cannot run" in err and "pip install -r" in err


def test_version_drift_fails_in_strict_mode(runner, monkeypatch, capsys):
    monkeypatch.setattr(runner, "pins", lambda: [("pytest", "0.0.1")])
    monkeypatch.setenv("PRATIBIMB_STRICT_PY_PINS", "1")
    assert runner.main() == 2
    assert "FAIL - versions differ" in capsys.readouterr().err


def test_an_old_python_fails(runner, monkeypatch, capsys):
    monkeypatch.setattr(runner, "MIN_PYTHON", (99, 0))
    assert runner.main() == 2
    assert "or newer is required" in capsys.readouterr().err


def test_the_pins_are_read_from_the_requirements_file(runner):
    names = dict(runner.pins())
    assert {"numpy", "pillow", "pytest", "torch"} <= set(names)
    assert all(v for v in names.values())
