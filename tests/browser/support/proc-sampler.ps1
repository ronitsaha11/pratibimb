# M20 benchmark: sample the processes under test, twice a second, one JSON line per sample.
#
#   powershell -NoProfile -File proc-sampler.ps1 <browser exe path> <model pid> <launcher pid>
#
# Groups: "browser" = every chrome.exe whose image is exactly the Chrome for Testing binary under test
# (renderers, GPU, extension and utility processes included); "model" = llama-server; "launcher" = the
# product launcher's node process. Reads counters only: working set, private bytes, the OS-recorded
# peak working set, and total CPU time. Never a command line, a window title or memory contents.
param([string]$BrowserPath, [int]$ModelPid, [int]$LauncherPid)
$clock = [System.Diagnostics.Stopwatch]::StartNew()
while ($true) {
  $t = $clock.Elapsed.TotalMilliseconds
  $procs = @()
  foreach ($p in @(Get-Process -Name chrome -ErrorAction SilentlyContinue)) {
    if ($p.Path -eq $BrowserPath) { $procs += , @('browser', $p) }
  }
  foreach ($pair in @(@('model', $ModelPid), @('launcher', $LauncherPid))) {
    $p = Get-Process -Id $pair[1] -ErrorAction SilentlyContinue
    if ($p) { $procs += , @($pair[0], $p) }
  }
  $rows = foreach ($entry in $procs) {
    $p = $entry[1]
    [pscustomobject]@{ group = $entry[0]; pid = $p.Id; ws = $p.WorkingSet64; pv = $p.PrivateMemorySize64; peakWs = $p.PeakWorkingSet64; cpuMs = [math]::Round($p.TotalProcessorTime.TotalMilliseconds, 1) }
  }
  [Console]::Out.WriteLine((ConvertTo-Json -Compress -Depth 3 @{ tMs = [math]::Round($t, 1); procs = @($rows) }))
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds 500
}
