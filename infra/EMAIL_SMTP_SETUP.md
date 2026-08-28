# OA 邮件发送配置

OA 的定时邮件由 `xinke-oa` 服务在服务器后台执行，网页关闭后仍会按设置发送。邮件服务通过环境变量配置，不会把 SMTP 密码写入数据库或前端资源。

在正式服务器 `/home/xinke-oa/shared/.env` 添加并填写：

```ini
SMTP_HOST=smtp.qiye.aliyun.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=oa@example.com
SMTP_PASSWORD=企业邮箱SMTP授权码
SMTP_FROM=oa@example.com
SMTP_TLS_REJECT_UNAUTHORIZED=true
```

常见端口：

- `465`：SSL/TLS，`SMTP_SECURE=true`
- `587`：STARTTLS，`SMTP_SECURE=false`

保存后执行：

```bash
chmod 600 /home/xinke-oa/shared/.env
systemctl restart xinke-oa
curl http://127.0.0.1:8787/api/email/status
```

状态接口返回 `configured: true` 后，后台“测试发送”会通过 SMTP 直接发送；日/周/月定时任务由 `xinke-oa` 常驻服务执行。企业邮箱还需要允许 SMTP 登录，并确保域名配置 SPF、DKIM、DMARC 以提高投递成功率。
