# 参与贡献

谢谢你看这个项目。它是个人项目，节奏慢但会认真看每一条反馈。

## 可以帮什么

- **报 Bug**：用 Bug 模板，写清楚操作系统、Node 版本、复现步骤、报错原文
- **提建议**：用 Feature 模板，说清楚"你想解决什么问题"，而不是"你希望加什么按钮"
- **改代码**：先开 issue 聊一句，避免白写
- **补人设**：写一个 `personas/xxx.json` 提 PR，比改核心代码更容易被接受
- **翻译文档**：英文 README 一直缺

## 开发环境

```bash
# Node 20+，建议 22 或更高（用了 node:sqlite）
npm install

cp .env.example .env      # 填 DEEPSEEK_API_KEY
node --env-file=.env --watch src/index.mjs
# 打开 http://127.0.0.1:3871 → 测试台
```

不接 QQ 也能开发，测试台是主要调试入口。

## 提交前请跑

```bash
node scripts/smoke.mjs           # 冒烟测试
node scripts/test-scene-v2.mjs   # 场景层单测
node scripts/test-uaffect.mjs    # 用户情绪模型单测
```

全部通过再提 PR。

## 代码约定

- **能用规则算的，不要调模型**：一轮只有感知和生成两次模型调用，这是设计底线
- **新增的层要能单独关掉**：每个模块在 `config` 里有开关，出问题能退回去
- **中文注释写"为什么"，不写"是什么"**
- 改 `installer/*.ps1` 时文件必须 UTF-8 **带 BOM**，`.cmd` 必须纯 ASCII
- 提交信息用中文或英文都行，写清楚改了什么

## 不要提交

```
.env / .env.dev          密钥
data/                    聊天记录与数据库
logs/                    日志
config*.json             个人配置
```

`.gitignore` 已经挡了；如果误提交，请立刻换掉对应的 Key。

## PR 流程

1. fork → 建分支（`feat/xxx` 或 `fix/xxx`）
2. 改完跑测试
3. 提 PR，写清楚：改了什么、为什么、怎么验证的
4. 我会尽量在几天内回

## 许可提醒

本项目是 **PolyForm Noncommercial 1.0.0**，不是开源许可。

贡献代码即表示同意：你的贡献以同一许可发布，作者可用于商业授权。
