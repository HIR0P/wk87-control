param(
    [switch]$Clean
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSCommandPath
$source = Join-Path $root "src"
$output = Join-Path $root "bin"
$exe = Join-Path $output "WK87Remap.exe"

$compiler = @(
    (Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"),
    (Join-Path $env:WINDIR "Microsoft.NET\Framework\v4.0.30319\csc.exe")
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $compiler) {
    throw "csc.exe not found. Install .NET Framework 4.x (it ships with Windows)."
}

if ($Clean -and (Test-Path $output)) {
    Remove-Item $output -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $output | Out-Null

$files = Get-ChildItem (Join-Path $source "*.cs") | Select-Object -ExpandProperty FullName

$compilerArgs = @(
    "/nologo",
    "/target:winexe",
    "/optimize+",
    "/platform:anycpu",
    "/out:$exe",
    "/win32manifest:$(Join-Path $source 'app.manifest')",
    "/r:System.dll",
    "/r:System.Drawing.dll",
    "/r:System.Windows.Forms.dll",
    "/r:System.Runtime.Serialization.dll"
) + $files

& $compiler @compilerArgs
if ($LASTEXITCODE -ne 0) {
    throw "compiler failed with exit code $LASTEXITCODE"
}

"Built $exe"

$log = Join-Path $output "selftest.log"
if (Test-Path $log) {
    Remove-Item $log -Force
}

$test = Start-Process -FilePath $exe -ArgumentList "--selftest" -Wait -PassThru
if (Test-Path $log) {
    Get-Content $log | Select-Object -Last 2
}
"Self-test exit code: $($test.ExitCode)"
if ($test.ExitCode -ne 0) {
    throw "self-test failed; see $log"
}
