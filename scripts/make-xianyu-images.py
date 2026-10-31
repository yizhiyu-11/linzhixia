# -*- coding: utf-8 -*-
"""生成闲鱼商品图（4 张，1080x1440）。"""
import os
from PIL import Image, ImageDraw, ImageFont

OUT = r'E:\ai-gf\docs\商业\闲鱼图片'
os.makedirs(OUT, exist_ok=True)

W, H = 1080, 1440
BG = '#FFFFFF'
INK = '#1F2430'
GRAY = '#6B7280'
LIGHT = '#F4F6FB'
ACCENT = '#3B6EF6'
ACCENT_SOFT = '#E8EFFE'
WARM = '#FF7A9A'
RED = '#D93F3F'

FONT_BD = r'C:\Windows\Fonts\msyhbd.ttc'
FONT_RG = r'C:\Windows\Fonts\msyh.ttc'


def f(size, bold=True):
    return ImageFont.truetype(FONT_BD if bold else FONT_RG, size)


def new_canvas():
    img = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 10], fill=ACCENT)
    return img, d


def text(d, xy, s, size, color=INK, bold=True, spacing=14):
    font = f(size, bold)
    y = xy[1]
    for line in s.split('\n'):
        d.text((xy[0], y), line, font=font, fill=color)
        y += size + spacing
    return y


def chip(d, x, y, label, color=ACCENT, fill=ACCENT_SOFT, size=30):
    font = f(size)
    w = d.textlength(label, font=font)
    pad_x, pad_y = 24, 14
    d.rounded_rectangle([x, y, x + w + pad_x * 2, y + size + pad_y * 2], radius=(size + pad_y * 2) // 2, fill=fill)
    d.text((x + pad_x, y + pad_y - 2), label, font=font, fill=color)
    return x + w + pad_x * 2 + 16


def footer(d, s):
    d.text((W // 2, H - 70), s, font=f(26, False), fill='#9AA3AF', anchor='ma')


# ---------------- 图 1：封面 ----------------
img, d = new_canvas()
d.rectangle([0, 10, W, 330], fill=LIGHT)
d.text((80, 60), '远程协助 · 一对一 · 语音或文字', font=f(30, False), fill=ACCENT)
d.text((80, 116), 'AI 陪伴系统', font=f(80), fill=INK)
d.text((80, 216), '装机咨询', font=f(80), fill=ACCENT)

text(d, (80, 400), '30 分钟讲清楚：\n能不能装、要花多少钱、值不值。', 44, INK, spacing=18)

x = 80
for label in ['本地运行', '数据自己存', '性格可定制']:
    x = chip(d, x, 616, label)

d.rounded_rectangle([80, 748, W - 80, 1052], radius=36, fill=LIGHT)
d.text((130, 792), '首单体验价', font=f(32, False), fill=GRAY)
d.text((130, 836), '¥9.9', font=f(116), fill=WARM)
d.text((130, 982), '30 分钟 · 语音或文字 · 给结论清单', font=f(30, False), fill=GRAY)

text(d, (80, 1120), '适合这样的你', 34, INK, spacing=12)
text(d, (80, 1186), '想装一套会聊天的 AI 角色，但不确定自己的电脑行不行、\n大概要花多少钱、会不会踩坑。', 32, GRAY, bold=False, spacing=12)

footer(d, '拍下后预约时间 · 咨询不满意可退')
img.save(os.path.join(OUT, '01-封面.png'))

# ---------------- 图 2：能判断什么 ----------------
img, d = new_canvas()
d.text((80, 80), '这 30 分钟，帮你把话说清楚', font=f(58), fill=INK)

y = 240
items = [
    ('你的电脑能不能跑', '配置、系统版本、内存，够不够用'),
    ('大概要花多少钱', '模型调用、语音合成、服务器，各是多少'),
    ('本地装还是云上装', '各自的优缺点和你该选哪个'),
    ('性格怎么调才不像客服', '从哪些维度改，改完大概什么效果'),
    ('哪些做法有风险', '账号、隐私、内容边界，提前避开'),
]
for i, (h, sub) in enumerate(items, 1):
    d.ellipse([80, y + 6, 118, y + 44], fill=ACCENT_SOFT)
    d.text((99, y + 25), str(i), font=f(26), fill=ACCENT, anchor='mm')
    d.text((144, y), h, font=f(40), fill=INK)
    d.text((144, y + 56), sub, font=f(28, False), fill=GRAY)
    y += 140

d.line([80, y + 10, W - 80, y + 10], fill='#E5E7EB', width=2)
text(d, (80, y + 46), '不包含什么', 34, RED, spacing=10)
text(d, (80, y + 106), '· 不代装、不代运营、不代持账号\n· 不承诺任何账号不被限制\n· 不接违规、侵权、成人向需求', 30, GRAY, bold=False, spacing=12)

footer(d, '先判断清楚，再决定要不要花钱')
img.save(os.path.join(OUT, '02-能判断什么.png'))

# ---------------- 图 3：服务分档 ----------------
img, d = new_canvas()
d.text((80, 80), '服务分档', font=f(58), fill=INK)
d.text((80, 166), '咨询已开放，部署与定制在筹备中', font=f(30, False), fill=GRAY)

cards = [
    ('咨询', '¥9.9', ['30 分钟语音或文字', '给结论清单', '不满意可退'], ACCENT, '现在可拍', True),
    ('基础部署', '¥199 起', ['远程装好、跑通', '讲解后台与备份', '7 天答疑'], '#9AA3AF', '筹备中', False),
    ('部署 + 人设定制', '¥399 起', ['定制 1 个人格', '30 条回复调优', '7 天答疑'], '#9AA3AF', '筹备中', False),
]
y = 244
for name, price, feats, color, badge, live in cards:
    d.rounded_rectangle([80, y, W - 80, y + 296], radius=32, outline='#E5E7EB', width=2,
                        fill='#FFFFFF' if live else '#FAFBFC')
    d.text((124, y + 34), name, font=f(40), fill=INK)
    d.text((124, y + 92), price, font=f(52), fill=color)
    fy = y + 166
    for ft in feats:
        d.text((124, fy), '· ' + ft, font=f(27, False), fill=GRAY)
        fy += 40
    font_b = f(26)
    bw = d.textlength(badge, font=font_b)
    bx1 = W - 120
    bx0 = bx1 - bw - 44
    d.rounded_rectangle([bx0, y + 36, bx1, y + 88], radius=26,
                        fill=ACCENT_SOFT if live else '#EEF0F3')
    d.text((bx0 + 22, y + 62), badge, font=font_b, fill=ACCENT if live else '#6B7280', anchor='lm')
    y += 318

text(d, (80, 1216), '为什么先做咨询：装机因人而异，先说清楚再动手，\n对你我都省时间。', 29, GRAY, bold=False, spacing=12)
footer(d, '价格以拍下时为准 · 部署类可先聊再约')
img.save(os.path.join(OUT, '03-服务分档.png'))

# ---------------- 图 4：流程与提示 ----------------
img, d = new_canvas()
d.text((80, 80), '怎么进行', font=f(58), fill=INK)

steps = [
    ('拍下并留言', '简单说下你的电脑和想要的角色'),
    ('约时间', '48 小时内，晚上优先'),
    ('聊 30 分钟', '语音或文字都行，边聊边给判断'),
    ('给结论清单', '能装/不能装、要花多少、怎么走'),
]
y = 230
for i, (h, sub) in enumerate(steps, 1):
    d.rounded_rectangle([80, y, W - 80, y + 170], radius=28, fill=LIGHT)
    d.text((120, y + 38), f'0{i}', font=f(46), fill=ACCENT)
    d.text((240, y + 34), h, font=f(38), fill=INK)
    d.text((240, y + 96), sub, font=f(28, False), fill=GRAY)
    y += 196

d.line([80, y + 16, W - 80, y + 16], fill='#E5E7EB', width=2)
text(d, (80, y + 56), '先小人后君子', 36, RED, spacing=12)
warns = [
    '不承诺账号安全：接入第三方平台的风险由你判断',
    '模型与语音费用自理，本服务不含额度',
    '不接涉黄、涉政、侵犯他人肖像或声音的需求',
]
wy = y + 118
for w in warns:
    d.text((80, wy), '· ' + w, font=f(28, False), fill=GRAY)
    wy += 50

footer(d, '看完还有疑问，可以拍咨询再细聊')
img.save(os.path.join(OUT, '04-流程与提示.png'))

print('已生成：')
for name in sorted(os.listdir(OUT)):
    p = os.path.join(OUT, name)
    print('  ', name, f'{os.path.getsize(p)/1024:.0f} KB')
