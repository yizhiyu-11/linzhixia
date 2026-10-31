# ai-gf

私人 AI 伴侣 · QQ（NapCat / OneBot v11）+ DeepSeek。
M1 版本目标：**能聊**——私聊收发、人设稳定、记得上下文、失败有兜底。

```
QQ 小号 ⇄ NapCat ⇄ 本服务（OneBot WS）⇄ DeepSeek API
                        │
                        └── SQLite：消息 / 事实 / 用量
```

---

## 前置条件

| 项 | 说明 |
|---|---|
| Node.js | **≥ 22**（本项目用了内置 `node:sqlite`，不装原生模块）。当前机器上 DSH 自带 v24.21.0 |
| NapCat | QQ 协议端，用小号登录 |
| DeepSeek API Key | 去 [platform.deepseek.com](https://platform.deepseek.com) 申请，充几块钱就够跑很久 |

> ⚠️ NapCat 是非官方协议，**只用小号**。风控导致掉线/限制是常态，代码里已加熔断（连续失败自动停 10 分钟）。

---

## 步骤 1：装好 NapCat 并登录小号

1. 下载 NapCat.Shell（Windows 版）解压到 `E:\napcat` 之类的地方
2. 双击启动，用**小号**扫码登录
3. 首次启动会生成 WebUI 地址（默认 `http://127.0.0.1:6099`），浏览器打开，按提示拿登录 token
4. 进「网络配置」→ 新建 **WebSocket 服务器**：
   - 端口 `3001`
   - Token 留空（如果要设，`.env` 里 `ONEBOT_TOKEN` 填一样的）
5. 确认 OneBot 11 协议已启用

> 不同版本的 NapCat 界面文案会变，找「WebSocket 服务端 / 正向 WS」这一项就对了。

## 步骤 2：配置

```powershell
cd E:\ai-gf
copy .env.example .env
notepad .env
```

至少要改三行：

```ini
DEEPSEEK_API_KEY=sk-xxxx          # 必填
ALLOWED_QQS=你的QQ号              # 必填，只有名单里的人能触发
ONEBOT_WS_URL=ws://127.0.0.1:3001 # NapCat 的端口对上
```

> `ALLOWED_QQS` 支持多个，逗号分隔（最多 3 人）。留空等于谁都能撩——别这么干。

## 步骤 3：启动

```powershell
# 装依赖（只有 ws 一个）
node "C:\Users\you\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs" install

# 启动
node --env-file=.env src/index.mjs
```

看到这两行就成功了：

```
[12:00:01] INFO  连接 OneBot：ws://127.0.0.1:3001
[12:00:01] INFO  登录账号：xxx（123456）
[12:00:01] INFO  就绪，等待消息。白名单：123456
```

然后用另一个号（或手机 QQ）给这个**小号**发条消息试试。

## 验证清单

- [ ] 发「在吗」→ 3 秒内收到回复
- [ ] 连发 3 条 → 按顺序逐条回复，不串台
- [ ] 问「我刚才说了什么」→ 能答上来（上下文生效）
- [ ] 换个号发 → 如果不在白名单，日志显示「忽略非白名单」，且不回复
- [ ] 把 API Key 改错 → 收到「……等我一下，我这边好像卡住了。」（兜底生效）

## 换人设

`personas/` 下已有三套，`.env` 里改 `PERSONA=` 即可：

| 文件 | 人设 |
|---|---|
| `default.json` | 林知夏 · 温柔粘人，七分恋人三分朋友 |
| `friend.json` | 周叙 · 冷静毒舌的男性朋友，无恋爱线 |
| `tsundere.json` | 沈野 · 傲娇毒舌，80% 凶 20% 软 |

改完重启生效。想加新的人设，复制一份改 `name/traits/speech` 就行，代码不用动。

## 目录结构

```
src/
  index.mjs      入口：收消息 → 生成 → 回复
  config.mjs     .env 解析与校验
  onebot.mjs     OneBot v11 WebSocket 客户端（含去重、重连、API 调用）
  brain.mjs      拼上下文、调模型、记用量
  memory.mjs     SQLite：消息 / 事实 / 摘要 / 关系 / 用量
  persona.mjs    人设 → system prompt
  safety.mjs     话题降级 + 风控熔断
data/bot.db      运行后生成
```

数据库表已经按 M2/M3 的需要建好了（`summaries`、`relation` 先空着）。

## 常见问题

**Q: 日志一直「OneBot 断开」**
NapCat 没启动，或端口不是 3001，或 Token 不匹配。先用浏览器/`wscat` 确认 `ws://127.0.0.1:3001` 能连。

**Q: 401 / 模型返回 401**
`DEEPSEEK_API_KEY` 错了或没余额。

**Q: 回了但很慢**
首字延迟主要来自模型。`deepseek-chat` 正常 1-3 秒；超过 10 秒看日志里的 `tokens`，可能是历史太长。

**Q: 小号被风控了**
典型症状：发消息失败、频繁要求重新登录。代码会熔断保护，但根治办法只有——**降频、换号、或者改回官方机器人**（放弃主动消息能力）。

## 下一步（按 spec 的里程碑）

- **M2**：三层记忆（日摘要/周摘要/长期画像）、多用户隔离完善
- **M3**：拟真节奏（分段发送、偶尔不回）、亲密度与关系阶段、主动消息
- **M4**：表情包、语音、识图（视觉模型）、Web 后台
- **M5**：成本监控、预算告警、稳定性

需求全文见 `C:\Users\you\Documents\deepseek-harness\default-workspace\ai-girlfriend-spec.md`。
