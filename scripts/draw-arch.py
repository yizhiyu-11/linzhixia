# -*- coding: utf-8 -*-
"""画一张架构图（临时预览，不放进 docs）。"""
import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1680, 1180
FB = r'C:\Windows\Fonts\msyhbd.ttc'
FR = r'C:\Windows\Fonts\msyh.ttc'
f = lambda s: ImageFont.truetype(FR, s)
fb = lambda s: ImageFont.truetype(FB, s)

INK = (28, 36, 50)
BLUE = (43, 110, 200)
GREY = (120, 134, 152)
LINE = (206, 218, 232)
BG = (250, 252, 255)
MODEL = (226, 74, 92)     # 模型调用
RULE = (56, 150, 120)     # 规则计算
DATA = (150, 106, 200)    # 存储

img = Image.new('RGB', (W, H), BG)
d = ImageDraw.Draw(img)


def box(x, y, w, h, title, sub='', color=INK, fill=(255, 255, 255), r=14, ts=26, ss=17):
    d.rounded_rectangle([x, y, x + w, y + h], radius=r, fill=fill, outline=color, width=2)
    d.text((x + 16, y + 12), title, font=fb(ts), fill=color)
    if sub:
        d.text((x + 16, y + 12 + ts + 8), sub, font=f(ss), fill=GREY)


def arrow(x1, y1, x2, y2, color=GREY, w=2, head=9):
    d.line([(x1, y1), (x2, y2)], fill=color, width=w)
    if x1 == x2:
        s = 1 if y2 > y1 else -1
        d.polygon([(x2, y2), (x2 - head, y2 - s * head), (x2 + head, y2 - s * head)], fill=color)
    else:
        s = 1 if x2 > x1 else -1
        d.polygon([(x2, y2), (x2 - s * head, y2 - head), (x2 - s * head, y2 + head)], fill=color)


# ── 标题 ─────────────────────────────────────────────
d.text((60, 34), '林知夏 · 整机架构', font=fb(40), fill=INK)
d.text((60, 88), '一条消息从进来到回复，中间经过十一层；只有两处调模型（红），其余全是本地规则（绿）',
       font=f(19), fill=GREY)

# ── 左：链路 ──────────────────────────────────────────
LX = 60
box(LX, 160, 230, 76, 'QQ 客户端', '用户手机', fill=(245, 248, 252))
box(LX, 268, 230, 76, 'SnowLuma', 'OneBot v11 桥接', fill=(245, 248, 252))
box(LX, 376, 230, 76, 'bot 主进程', 'Node 24 · index.mjs', color=BLUE, fill=(240, 246, 255))
arrow(LX + 115, 236, LX + 115, 268)
arrow(LX + 115, 344, LX + 115, 376)
d.text((LX + 4, 150 - 22), '① 接入', font=fb(18), fill=GREY)

# ── 中：管线 ──────────────────────────────────────────
CX, CW = 360, 620
steps = [
    ('感知 perceive', '语气+强度 / 意图 / 话题 / 他对她做了什么', MODEL),
    ('场景 getScene', '时间带 → 场景 → 事项生命周期 → seeds / pace / chat', RULE),
    ('她的情绪 affect', '事件注入 → 半衰期衰减（忙快闲慢） → toneHint', RULE),
    ('他的情绪 uaffect', '语气+行为信号 → v/a/置信/趋势 → 共情/收敛/别打扰', RULE),
    ('记忆 recall', '事实 + 情节 + 最近消息 → 关键词召回 + 元记忆', RULE),
    ('裁决 decideAct', 'answer/engage/advance/deflect/sticky + strength', RULE),
    ('生成 brain', '人设+事实+摘要+场景+情绪+记忆 → 说人话', MODEL),
    ('纠错 + 切条', '五道重试（重复/方向/句式/场景矛盾）→ 按 ||| 切 1-4 条', RULE),
    ('投递 deliver', '打字节奏 / 条间停顿 / 表情包 / 语音', RULE),
]
y = 160
for i, (t, s, c) in enumerate(steps):
    box(CX, y, CW, 74, t, s, color=c, fill=(255, 255, 255) if c == RULE else (255, 246, 248))
    if i < len(steps) - 1:
        arrow(CX + 40, y + 74, CX + 40, y + 96)
    y += 96

arrow(LX + 230, 414, CX, 196, color=BLUE, w=2)

# ── 右：数据层 ────────────────────────────────────────
RX = 1050
d.text((RX, 150), '② 数据层（SQLite）', font=fb(20), fill=DATA)
data_items = [
    ('messages', '原始消息 7 天'),
    ('facts', '稳定事实'),
    ('episodes', '情节记忆（相似合并）'),
    ('summaries', '日摘要'),
    ('perceptions', '每轮感知'),
    ('turns', '每轮全过程'),
    ('state', '场景/情绪/他的状态'),
    ('media_seen', '图片去重'),
]
y = 186
for k, v in data_items:
    box(RX, y, 250, 62, k, v, color=DATA, fill=(252, 250, 255), r=10, ts=21, ss=15)
    y += 72

box(RX, 186 + 8 * 72 + 10, 250, 74, '管理后台', 'HTTP 3870 · 只监听本机', color=BLUE, fill=(240, 246, 255), r=10, ts=21, ss=15)

# ── 底：后台任务 ──────────────────────────────────────
d.text((60, 1042), '③ 后台任务（不进对话流程）', font=fb(20), fill=GREY)
tasks = ['主动消息：理由+角度 → 必须指向他 → chat 门槛', '摘要：每 24 条', '事实抽取：每 12 条', '看门狗：5 分钟巡检']
x = 60
for t in tasks:
    w = int(d.textlength(t, font=f(17))) + 34
    d.rounded_rectangle([x, 1076, x + w, 1116], radius=10, fill=(255, 255, 255), outline=LINE, width=2)
    d.text((x + 16, 1084), t, font=f(17), fill=INK)
    x += w + 14

# ── 图例 ─────────────────────────────────────────────
lx = 1116
for name, c in (('模型调用', MODEL), ('本地规则', RULE), ('存储', DATA)):
    d.ellipse([lx, 1082, lx + 14, 1096], fill=c)
    d.text((lx + 22, 1078), name, font=f(17), fill=INK)
    lx += 130

# ── 关键说明 ─────────────────────────────────────────
d.text((60, 128), '每轮 2 次模型调用 · 其余本地计算 · 每层可单独开关回滚', font=f(18), fill=(150, 90, 100))

os.makedirs('_tmp', exist_ok=True)
out = '_tmp/架构图.png'
img.save(out)
print('  saved', out)
