# xinke-oa
昕科oa系统代码

## Production Backups

Production snapshots are stored under `production-backups/` by timestamp.

Each snapshot contains:

- `xinke-oa-code.tar.gz`: deployed application code, excluding `node_modules` and server environment files.
- `xinke_oa.sql.gz.enc`: encrypted MariaDB `xinke_oa` database export.
- `SHA256SUMS`: integrity checks for the two archive files.
- `metadata.txt`: backup timestamp and encryption parameters.

The database archive uses AES-256-CBC with PBKDF2 (600,000 iterations). The decryption passphrase is intentionally kept outside this public repository in the local deployment backup key store. Do not publish it in issues, commits, or documentation.
