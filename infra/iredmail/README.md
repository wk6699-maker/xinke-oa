# Local iRedMail

This directory starts the official `iredmail/mariadb:stable` container for
local development. It uses Docker named volumes because Docker Desktop on
Windows does not support the official bind-mount layout reliably.

## Start

Run the following after Docker Desktop reports that its engine is running:

```powershell
Set-Location D:\Procjet\xinke_email\infra\iredmail
.\start.ps1
```

The script creates `iredmail-docker.conf` and a local-only password file on
first launch. Both are ignored by Git.

## Local access

- Webmail (Roundcube): `http://localhost/`
- Administration (iRedAdmin): `http://localhost/iredadmin/`
- Mail domain: `xinke.test`
- Administrator account: `postmaster@xinke.test`
- Administrator password: `secrets/postmaster-password.txt`

The container exposes SMTP `25`, SMTPS `465`, submission `587`, IMAP `143`,
IMAPS `993`, POP3 `110`, and POP3S `995` on the local machine. It generates a
self-signed TLS certificate on first boot, so mail clients must trust it for
this local environment.

## Operations

```powershell
Set-Location D:\Procjet\xinke_email\infra\iredmail
& 'C:\Program Files\Docker\Docker\resources\bin\docker.exe' compose logs --tail 200 -f iredmail
& 'C:\Program Files\Docker\Docker\resources\bin\docker.exe' compose down
```

`xinke.test` is intentionally a local demonstration domain. It cannot send or
receive Internet email. A public deployment requires a fixed public IP, PTR,
MX, SPF, DKIM, DMARC, a trusted TLS certificate, and firewall/rate-limit
hardening. The Dockerized iRedMail project itself is documented upstream as a
beta deployment option, so do not use this setup as a production mail service.
