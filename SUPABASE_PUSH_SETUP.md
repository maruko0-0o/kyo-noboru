# 开启关闭后行程提醒

网页端已经完成。下面是一次性的 Supabase 后端配置；密钥不能提交到 GitHub。

1. 本地运行 `node scripts/generate-vapid-keys.mjs`，把输出保存到本机的 `push-notification-secrets.env`（此文件已被 Git 忽略）。
2. 在 Supabase Dashboard 的 **Edge Functions → Secrets** 添加四项：
   - `PUSH_VAPID_PUBLIC_KEY`
   - `PUSH_VAPID_PRIVATE_KEY`
   - `PUSH_VAPID_SUBJECT`（例如 `mailto:you@example.com`）
   - `PUSH_WEBHOOK_SECRET`
3. 部署 [supabase/functions/push-notifications/index.ts](supabase/functions/push-notifications/index.ts) 为名为 `push-notifications` 的 Edge Function，并确认 [supabase/config.toml](supabase/config.toml) 中该函数的 `verify_jwt = false` 一并生效。部署后，它的地址是：
   `https://mtbrvujoandyhrkeplio.supabase.co/functions/v1/push-notifications`
4. 在 Dashboard 的 SQL Editor 执行 [supabase/push-notifications.sql](supabase/push-notifications.sql)。
5. 仍在 SQL Editor，填入第 1 步生成的 `PUSH_WEBHOOK_SECRET` 并执行：

   ```sql
   alter database postgres set app.climb_push_function_url =
     'https://mtbrvujoandyhrkeplio.supabase.co/functions/v1/push-notifications';
   alter database postgres set app.climb_push_webhook_secret = '替换成第 1 步生成的密钥';
   select pg_reload_conf();
   ```

6. 在 iPhone 上请先用 Safari 将日历“添加到主屏幕”，从桌面打开后点“开启提醒”。每位岩友需要各自授权一次。

部署后，新增、编辑、取消行程会由数据库触发 Edge Function，再发送 Web Push。通知点击后会回到日历。
