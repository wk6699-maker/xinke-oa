[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSCommandPath
$configPath = Join-Path $root 'iredmail-docker.conf'
$secretsDir = Join-Path $root 'secrets'
$passwordPath = Join-Path $secretsDir 'postmaster-password.txt'
$docker = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe'

function New-Secret {
    param([Parameter(Mandatory)][int]$ByteLength)

    $bytes = [byte[]]::new($ByteLength)
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    return [Convert]::ToBase64String($bytes).Replace('+', 'A').Replace('/', 'b').TrimEnd('=')
}

if (-not (Test-Path $docker)) {
    $docker = 'docker'
}

& $docker info *> $null
if ($LASTEXITCODE -ne 0) {
    throw 'Docker Engine is unavailable. Start Docker Desktop after enabling WSL2 and Virtual Machine Platform.'
}

if (-not (Test-Path $configPath)) {
    New-Item -ItemType Directory -Force -Path $secretsDir | Out-Null

    $password = New-Secret -ByteLength 30
    $mlmmjToken = New-Secret -ByteLength 48
    $roundcubeKey = New-Secret -ByteLength 36

    @(
        'HOSTNAME=mail.xinke.test'
        'FIRST_MAIL_DOMAIN=xinke.test'
        "FIRST_MAIL_DOMAIN_ADMIN_PASSWORD=$password"
        "MLMMJADMIN_API_TOKEN=$mlmmjToken"
        "ROUNDCUBE_DES_KEY=$roundcubeKey"
        'FAIL2BAN_ENABLED=NO'
    ) | Set-Content -LiteralPath $configPath -Encoding ascii -NoNewline

    Set-Content -LiteralPath $passwordPath -Value $password -Encoding ascii -NoNewline
}

Push-Location $root
try {
    & $docker compose up -d
    if ($LASTEXITCODE -ne 0) {
        throw 'iRedMail container creation failed. Inspect logs with: docker compose logs --tail 200 iredmail'
    }
}
finally {
    Pop-Location
}

Write-Host 'iRedMail started. Open http://localhost/ for webmail and http://localhost/iredadmin/ for administration.'
