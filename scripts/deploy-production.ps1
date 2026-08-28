[CmdletBinding()]
param(
  [string]$Target = 'xinke-production',
  [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupRoot = Join-Path $projectRoot 'backups\deployments'
$backupDir = Join-Path $backupRoot $timestamp
$runtimeDir = Join-Path $backupDir 'runtime'
$sourceDir = Join-Path $backupDir 'source'
$manifestPath = Join-Path $backupDir 'source-manifest.txt'
$diffPath = Join-Path $backupDir 'source-diff.txt'

function Invoke-Pnpm {
  param([string[]]$Arguments)

  $fallbackNodeDir = 'C:\Users\admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin'
  if (-not (Get-Command node -ErrorAction SilentlyContinue) -and (Test-Path (Join-Path $fallbackNodeDir 'node.exe'))) {
    $env:PATH = "$fallbackNodeDir;$env:PATH"
  }
  $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
  $fallbackPnpm = 'C:\Users\admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd'
  $pnpmPath = if ($pnpm) { $pnpm.Source } elseif (Test-Path $fallbackPnpm) { $fallbackPnpm } else { throw 'pnpm was not found.' }

  & $pnpmPath @Arguments
  if ($LASTEXITCODE -ne 0) { throw "pnpm $($Arguments -join ' ') failed." }
}

function Get-SourceManifest {
  param([string]$Root)

  $tracked = @('src', 'scripts', 'infra', 'server.mjs', 'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'index.html', 'vite.config.ts', 'tsconfig.json', 'tsconfig.node.json')
  $files = foreach ($item in $tracked) {
    $path = Join-Path $Root $item
    if (-not (Test-Path $path)) { continue }
    if ((Get-Item $path).PSIsContainer) {
      Get-ChildItem $path -File -Recurse
    } else {
      Get-Item $path
    }
  }
  $files | Sort-Object FullName | ForEach-Object {
    $relative = $_.FullName.Substring($Root.Length).TrimStart('\').Replace('\', '/')
    "$((Get-FileHash $_.FullName -Algorithm SHA256).Hash)  $relative"
  }
}

function Convert-Manifest {
  param([string]$Path)
  $entries = @{}
  if (-not (Test-Path $Path)) { return $entries }
  Get-Content $Path | ForEach-Object {
    if ($_ -match '^(?<hash>[A-F0-9]+)  (?<path>.+)$') { $entries[$Matches.path] = $Matches.hash }
  }
  return $entries
}

Set-Location $projectRoot
Write-Host '1/5 Validate TypeScript...'
Invoke-Pnpm @('exec', 'tsc', '--noEmit')

Write-Host '2/5 Build production assets...'
Invoke-Pnpm @('build')

New-Item -ItemType Directory -Path $sourceDir, $runtimeDir -Force | Out-Null
Write-Host "3/5 Create local backup: $backupDir"
$sourceItems = @('src', 'scripts', 'infra', 'server.mjs', 'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'index.html', 'vite.config.ts', 'tsconfig.json', 'tsconfig.node.json')
foreach ($item in $sourceItems) {
  $path = Join-Path $projectRoot $item
  if (Test-Path $path) { Copy-Item $path (Join-Path $sourceDir $item) -Recurse -Force }
}
Get-SourceManifest $projectRoot | Set-Content $manifestPath -Encoding utf8
$previousManifest = Get-ChildItem $backupRoot -Filter 'source-manifest.txt' -Recurse -File |
  Where-Object { $_.FullName -ne $manifestPath } |
  Sort-Object FullName -Descending |
  Select-Object -First 1
$before = if ($previousManifest) { Convert-Manifest $previousManifest.FullName } else { @{} }
$after = Convert-Manifest $manifestPath
$changes = foreach ($path in ($before.Keys + $after.Keys | Sort-Object -Unique)) {
  if (-not $before.ContainsKey($path)) { "added   $path" }
  elseif (-not $after.ContainsKey($path)) { "deleted $path" }
  elseif ($before[$path] -ne $after[$path]) { "changed $path" }
}
$diffLines = if ($changes) { $changes } else { 'no source changes' }
$diffLines | Set-Content $diffPath -Encoding utf8
Compress-Archive -Path (Join-Path $sourceDir '*') -DestinationPath (Join-Path $backupDir 'source.zip') -Force

Copy-Item (Join-Path $projectRoot 'dist') (Join-Path $runtimeDir 'dist') -Recurse -Force
foreach ($file in @('server.mjs', 'package.json', 'package-lock.json')) {
  $path = Join-Path $projectRoot $file
  if (Test-Path $path) { Copy-Item $path (Join-Path $runtimeDir $file) -Force }
}

if ($ValidateOnly) {
  Write-Host "Validation complete. Local backup: $backupDir"
  exit 0
}

$releaseDir = "/home/xinke-oa/releases/$timestamp"
$remoteBackupDir = "/home/xinke-oa/deploy-backups/$timestamp"
Write-Host '4/5 Upload release and create remote diff backup...'
& ssh $Target "mkdir -p '$releaseDir'"
if ($LASTEXITCODE -ne 0) { throw 'Unable to create remote release directory.' }
& scp -r (Join-Path $runtimeDir 'dist') "${Target}:$releaseDir/"
if ($LASTEXITCODE -ne 0) { throw 'Unable to upload frontend assets.' }
foreach ($file in @('server.mjs', 'package.json', 'package-lock.json')) {
  $path = Join-Path $runtimeDir $file
  if (Test-Path $path) {
    & scp $path "${Target}:$releaseDir/$file"
    if ($LASTEXITCODE -ne 0) { throw "Unable to upload $file." }
  }
}

$remoteScript = @'
set -euo pipefail
release_dir="$1"
backup_dir="$2"
current_dir=/home/xinke-oa/current
mkdir -p "$backup_dir/files" "$release_dir"
: > "$backup_dir/diff.txt"

backup_if_changed() {
  staged="$1"
  live="$2"
  relative="$3"
  if [ ! -f "$live" ]; then
    printf 'added   %s\n' "$relative" >> "$backup_dir/diff.txt"
    return
  fi
  if ! cmp -s "$staged" "$live"; then
    printf 'changed %s\n' "$relative" >> "$backup_dir/diff.txt"
    mkdir -p "$(dirname "$backup_dir/files/$relative")"
    cp -p "$live" "$backup_dir/files/$relative"
  fi
}

while IFS= read -r relative; do
  relative="${relative#./}"
  backup_if_changed "$release_dir/dist/$relative" "$current_dir/dist/$relative" "dist/$relative"
done < <(cd "$release_dir/dist" && find . -type f -print)

for relative in server.mjs package.json package-lock.json; do
  if [ -f "$release_dir/$relative" ]; then
    backup_if_changed "$release_dir/$relative" "$current_dir/$relative" "$relative"
  fi
done

if [ ! -s "$backup_dir/diff.txt" ]; then
  printf 'no runtime changes\n' > "$backup_dir/diff.txt"
fi
cp -a "$release_dir/dist/." "$current_dir/dist/"
for relative in server.mjs package.json package-lock.json; do
  if [ -f "$release_dir/$relative" ]; then cp -p "$release_dir/$relative" "$current_dir/$relative"; fi
done
systemctl restart xinke-oa
'@
$remoteEncoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remoteScript))
& ssh $Target "echo '$remoteEncoded' | base64 -d | bash -s -- '$releaseDir' '$remoteBackupDir'"
if ($LASTEXITCODE -ne 0) { throw 'Remote sync, restart, or health check failed. Remote diff backup was retained.' }
& ssh $Target "curl -fsS -o /dev/null http://127.0.0.1:8787/"
if ($LASTEXITCODE -ne 0) { throw 'Remote service restarted but HTTP health check failed. Remote diff backup was retained.' }

Write-Host "5/5 Deployment complete. Local backup: $backupDir"
Write-Host "Remote release: $releaseDir"
Write-Host "Remote diff backup: $remoteBackupDir"
