# Local stand-in for the heat's timing (no Docker here): each round runs the null control and every entry once, in a
# random order, each as a fresh node process pinned to one CPU, and reads its user+system CPU time (microseconds).
# Round 0 is the untimed warm-up. Writes CSV lines: round,entry,cpu_us.
#   powershell -File cpu.ps1 -Input <dir with cases.json> -Rounds 10 -Entries name=path/to/main.ts,name2=...
param(
  [Parameter(Mandatory)][string]$InputDir,
  [Parameter(Mandatory)][string[]]$Entries,
  [int]$Rounds = 10,
  [string]$Out = "timings.csv",
  [int]$Seed = 1
)
$Entries = @($Entries | ForEach-Object { $_ -split "," })
$nullJs = Join-Path $PSScriptRoot "null.mjs"
$jobs = @(@{ name = "null"; file = $nullJs }) + ($Entries | ForEach-Object { $n, $f = $_ -split "=", 2; @{ name = $n; file = $f } })
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("cpu-bench-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tmp | Out-Null
$rng = New-Object System.Random $Seed
"round,entry,cpu_us" | Set-Content $Out
for ($r = 0; $r -lt $Rounds; $r++) {
  foreach ($j in ($jobs | Sort-Object { $rng.Next() })) {
    $o = Join-Path $tmp "$($j.name)"
    New-Item -ItemType Directory -Force -Path $o | Out-Null
    $env:MAKEFUN_INPUT_DIR = $InputDir
    $env:MAKEFUN_OUTPUT_DIR = $o
    $p = Start-Process -FilePath node -ArgumentList ('"' + $j.file + '"') -NoNewWindow -PassThru
    try { $p.ProcessorAffinity = [IntPtr]2 } catch {}
    $null = $p.Handle
    $p.WaitForExit()
    $p.Refresh()
    if ($p.ExitCode -ne 0) { throw "$($j.name) exited $($p.ExitCode)" }
    $us = [int64]($p.TotalProcessorTime.TotalMilliseconds * 1000)
    "$r,$($j.name),$us" | Add-Content $Out
  }
}
Remove-Item -Recurse -Force $tmp
