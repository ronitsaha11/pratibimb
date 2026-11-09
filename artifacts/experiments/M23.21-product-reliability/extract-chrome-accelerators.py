"""Extract Chrome's browser accelerators from accelerator_table.cc, evaluating platform guards for Windows.

A guard that names something other than a platform (branding, printing, DCHECK, a feature) is kept as
"conditional": the fixture treats it as possibly present, which is the conservative reading for choosing a key.
"""
import json
import re
import sys

# Usage: python -I extract-chrome-accelerators.py <accelerator_table.cc> <out.json> <tag> <tag object sha>
src_path, out_path, tag, tag_object = sys.argv[1:5]
text = open(src_path, encoding="utf-8").read()

PLATFORM = {"IS_WIN": True, "IS_MAC": False, "IS_CHROMEOS": False, "IS_LINUX": False, "IS_ANDROID": False, "IS_IOS": False, "IS_FUCHSIA": False, "IS_OZONE": False}


def evaluate(cond):
    """True / False for Windows, or None when it depends on something other than the platform."""
    expr = cond
    unknown = False

    def flag(m):
        nonlocal unknown
        name = m.group(1)
        if name in PLATFORM:
            return "True" if PLATFORM[name] else "False"
        unknown = True
        return "U"

    expr = re.sub(r"BUILDFLAG\((\w+)\)", flag, expr)
    expr = re.sub(r"defined\((\w+)\)", "U", expr)  # none in this file; unknown if one appears
    if re.search(r"DCHECK_IS_ON\(\)", expr):
        unknown = True
        expr = expr.replace("DCHECK_IS_ON()", "U")
    expr = expr.replace("&&", " and ").replace("||", " or ").replace("!", " not ")
    # Three-valued: try U as True and as False.
    vals = set()
    for u in (True, False):
        try:
            vals.add(bool(eval(expr.replace("U", str(u)), {"__builtins__": {}})))
        except Exception:
            return None
    return vals.pop() if len(vals) == 1 else None


stack = []  # each: [conditions-so-far list, current-branch-condition]
array = None
entries = []
lines = text.split("\n")
buf = ""
for no, raw in enumerate(lines, 1):
    line = raw.strip()
    m = re.match(r"#\s*if\s+(.*)", line)
    if m and not line.startswith("#ifdef") and not line.startswith("#ifndef"):
        stack.append({"prior": [], "cur": m.group(1).split("//")[0].strip()})
        continue
    m = re.match(r"#\s*elif\s+(.*)", line)
    if m:
        top = stack[-1]
        top["prior"].append(top["cur"])
        top["cur"] = m.group(1).split("//")[0].strip()
        continue
    if re.match(r"#\s*else", line):
        top = stack[-1]
        top["prior"].append(top["cur"])
        top["cur"] = "!(" + ") && !(".join(top["prior"]) + ")"
        top["prior"] = []
        continue
    if re.match(r"#\s*endif", line):
        stack.pop()
        continue
    m = re.match(r"(?:constexpr|const)\s+AcceleratorMapping\s+(\w+)\[\]", line)
    if m:
        array = m.group(1)
        continue
    if line.startswith("};"):
        array = None
        continue
    # GetAcceleratorList() also appends single mappings with emplace_back(AcceleratorMapping({...})).
    if "emplace_back(" in line:
        array = "GetAcceleratorList.emplace_back"
        buf = ""
        rest = line[line.find("{"):] if "{" in line else ""
        if not rest:
            continue
        line = rest
    elif array == "GetAcceleratorList.emplace_back" and not buf and "{ui::VKEY" in line:
        line = line[line.find("{"):]
    if array is None:
        continue
    buf = (buf + " " + line).strip() if buf else line
    if buf.startswith("{ui::VKEY") or buf.startswith("{ ui::VKEY"):
        if "}" not in buf:
            continue
        e = re.match(r"\{\s*ui::(VKEY_\w+)\s*,\s*([^,]+?)\s*,\s*(IDC_\w+)\s*\}", buf)
        buf = ""
        if not e:
            continue
        vkey, mods, idc = e.groups()
        # The debug map's modifier constant (`constexpr int kDebugModifier = ui::EF_CONTROL_DOWN | ui::EF_ALT_DOWN | ui::EF_SHIFT_DOWN;`).
        mods = mods.replace("kDebugModifier", "EF_CONTROL_DOWN | EF_ALT_DOWN | EF_SHIFT_DOWN")
        modset = sorted({x.strip().replace("ui::", "") for x in mods.split("|")} - {"EF_NONE"})
        guards = [g["cur"] for g in stack]
        results = [evaluate(g) for g in guards]
        if any(r is False for r in results):
            on_windows = "no"
        elif all(r is True for r in results):
            on_windows = "conditional" if array == "kUIDebugAcceleratorMap" else "yes"
        else:
            on_windows = "conditional"
        entries.append({"line": no, "array": array, "key": vkey, "modifiers": modset, "command": idc, "guards": guards, "onWindows": on_windows})
        if array == "GetAcceleratorList.emplace_back":
            array = None
    else:
        buf = ""

out = {
    "source": "chromium/src chrome/browser/ui/accelerator_table.cc",
    "tag": tag,
    "tagObject": tag_object,
    "retrieved": "2026-11-08",
    "license": "Chromium, BSD-3-Clause. Facts extracted for a test fixture.",
    "readingForWindows": "EF_PLATFORM_ACCELERATOR is Ctrl on Windows. 'yes': present in a Windows build; 'no': excluded by a platform guard; 'conditional': depends on branding, a build option, DCHECK or a feature, and is treated as possibly present.",
    "consultedBy": "IsChromeAccelerator (chrome/browser/ui/views/accelerator_utils_aura.cc) iterates GetAcceleratorList(); CommandService::CanAutoAssign refuses a non-global suggested key it matches",
    "entries": entries,
}
json.dump(out, open(out_path, "w", encoding="utf-8", newline="\n"), indent=1, ensure_ascii=False)
print(len(entries), "entries;", sum(e["onWindows"] == "yes" for e in entries), "yes,", sum(e["onWindows"] == "no" for e in entries), "no,", sum(e["onWindows"] == "conditional" for e in entries), "conditional")
for e in entries:
    if e["key"] in ("VKEY_P", "VKEY_Y"):
        print(e["line"], e["array"], e["key"], e["modifiers"], e["command"], e["onWindows"], e["guards"])
