# -*- coding: utf-8 -*-
"""闲鱼商品图 v2：3 版封面风格 + 内容页（无语音沟通 / 新价格阶梯 / 真实实例）。"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = r'E:\ai-gf\docs\商业\闲鱼图片'
SHOT = r'E:\ai-gf\docs\商业\截图'
os.makedirs(OUT, exist_ok=True)

W, H = 1080, 1440
FONT_BD = r'C:\Windows\Fonts\msyhbd.ttc'
FONT_RG = r'C:\Windows\Fonts\msyh.ttc'


def f(size, bold=True):
    return ImageFont.truetype(FONT_BD if bold else FONT_RG, size)


def canvas(bg='#FFFFFF'):
    img = Image.new('RGB', (W, H), bg)
    return img, ImageDraw.Draw(img)


def text(d, xy, s, size, color='#1F2430', bold=True, spacing=14):
    font = f(size, bold)
    y = xy[1]
    for line in s.split('\n'):
        d.text((xy[0], y), line, font=font, fill=color)
        y += size + spacing
    return y


def vgrad(img, box, c1, c2):
    x0, y0, x1, y1 = box
    grad = Image.new('RGB', (1, max(1, y1 - y0)))
    px = grad.load()
    r1, g1, b1 = Image.new('RGB', (1, 1), c1).getpixel((0, 0))
    r2, g2, b2 = Image.new('RGB', (1, 1), c2).getpixel((0, 0))
    h = y1 - y0
    for i in range(h):
        t = i / max(1, h - 1)
        px[0, i] = (int(r1 + (r2 - r1) * t), int(g1 + (g2 - g1) * t), int(b1 + (b2 - b1) * t))
    img.paste(grad.resize((x1 - x0, h)), (x0, y0))


def chip(d, x, y, label, fg, bg, size=28):
    font = f(size)
    w = d.textlength(label, font=font)
    d.rounded_rectangle([x, y, x + w + 40, y + size + 26], radius=(size + 26) // 2, fill=bg)
    d.text((x + 20, y + 13), label, font=font, fill=fg)
    return x + w + 40 + 14


def paste_rounded(base, img, xy, radius=26, border=None, bw=3):
    img = img.convert('RGB')
    mask = Image.new('L', img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.size[0], img.size[1]], radius=radius, fill=255)
    if border:
        ImageDraw.Draw(img).rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1], radius=radius,
                                              outline=border, width=bw)
    base.paste(img, xy, mask)


# ============ 封面 A：深色霓虹 ============
def cover_dark():
    img, d = canvas('#0B0F1A')
    vgrad(img, (0, 0, W, 620), '#101A33', '#0B0F1A')
    d = ImageDraw.Draw(img)
    # 光斑
    glow = Image.new('RGB', (W, H), '#0B0F1A')
    gd = ImageDraw.Draw(glow)
    gd.ellipse([560, -160, 1180, 460], fill='#1B3A7A')
    gd.ellipse([-260, 520, 360, 1140], fill='#3A1B5A')
    glow = glow.filter(ImageFilter.GaussianBlur(160))
    img = Image.blend(img, glow, 0.55)
    d = ImageDraw.Draw(img)

    d.text((80, 90), 'AI COMPANION · 本地部署', font=f(26), fill='#7FA6FF')
    d.text((80, 150), '装一套', font=f(96), fill='#FFFFFF')
    d.text((80, 262), '会记得你的', font=f(96), fill='#FFFFFF')
    d.text((80, 374), 'AI 角色', font=f(96), fill='#6EE7FF')

    d.text((80, 520), '不是又一个聊天框。她记得你说过的话，\n有自己的脾气，装在你自己的机器上。', font=f(32, False), fill='#A8B3C7')

    y = 640
    for label in ['记得住', '有性格', '数据本地', '可调教']:
        col = ['#6EE7FF', '#FFB3C7', '#9DFFC4', '#FFD98E'][['记得住', '有性格', '数据本地', '可调教'].index(label)]
        d.rounded_rectangle([80 + ['记得住', '有性格', '数据本地', '可调教'].index(label) * 236, y,
                             80 + ['记得住', '有性格', '数据本地', '可调教'].index(label) * 236 + 216, y + 66],
                            radius=33, outline=col, width=2)
        d.text((80 + ['记得住', '有性格', '数据本地', '可调教'].index(label) * 236 + 108, y + 33), label,
               font=f(30), fill=col, anchor='mm')

    # 价格区
    d.rounded_rectangle([80, 790, W - 80, 1090], radius=40, fill='#141B2E', outline='#24304A', width=2)
    d.text((130, 842), '装机咨询 · 文字', font=f(30, False), fill='#8FA0BD')
    d.text((130, 896), '¥9.9', font=f(120), fill='#6EE7FF')
    d.text((130, 1036), '15 分钟 · 告诉你能不能装、要花多少', font=f(28, False), fill='#8FA0BD')

    d.text((80, 1160), '已经跑起来了，不是 PPT', font=f(40), fill='#FFFFFF')
    d.text((80, 1220), '本地 / 云服务器都能装，成品可交付', font=f(30, False), fill='#8FA0BD')
    d.text((W // 2, H - 56), '拍下后约时间 · 不满意可退', font=f(24, False), fill='#5D6B85', anchor='ma')
    img.save(os.path.join(OUT, '封面A-深色.png'))


# ============ 封面 B：糖果渐变 ============
def cover_candy():
    img, d = canvas('#FFF8FA')
    blob = Image.new('RGB', (W, H), '#FFF8FA')
    bd = ImageDraw.Draw(blob)
    bd.ellipse([-200, -260, 620, 460], fill='#FFD6E4')
    bd.ellipse([600, 60, 1260, 700], fill='#D6E4FF')
    bd.ellipse([-160, 800, 420, 1380], fill='#E3D9FF')
    blob = blob.filter(ImageFilter.GaussianBlur(120))
    img = Image.blend(img, blob, 0.85)
    d = ImageDraw.Draw(img)

    d.rounded_rectangle([80, 96, 470, 158], radius=31, fill='#FFFFFF')
    d.text((110, 112), 'AI 伴侣 · 装机咨询', font=f(28), fill='#FF5C8A')

    d.text((80, 220), '把她装进', font=f(92), fill='#241B2F')
    d.text((80, 330), '你的电脑里', font=f(92), fill='#FF5C8A')

    d.rounded_rectangle([80, 470, W - 80, 640], radius=36, fill='#FFFFFF')
    d.text((120, 500), '会记得你说过的事，会有自己的脾气，\n不用联网服务，数据在你手里。', font=f(30, False), fill='#6B6375')

    x, y = 80, 690
    for label, bgc, fgc in [('记得住', '#FFE3EC', '#E5486E'), ('有性格', '#E3ECFF', '#3B62D9'), ('本地运行', '#E6FFF2', '#128A5B')]:
        x = chip(d, x, y, label, fgc, bgc, 28)

    d.rounded_rectangle([80, 810, W - 80, 1104], radius=40, fill='#241B2F')
    d.text((130, 856), '咨询体验价', font=f(30, False), fill='#B9AFC7')
    d.text((130, 906), '¥9.9', font=f(118), fill='#FFD1E0')
    d.text((130, 1046), '文字沟通 · 15 分钟 · 给结论', font=f(28, False), fill='#B9AFC7')

    d.text((80, 1170), '已经有成品可以直接交付', font=f(38), fill='#241B2F')
    d.text((80, 1230), '本地版 / 云服务器版，装上就能聊', font=f(28, False), fill='#7C7089')
    d.text((W // 2, H - 56), '拍下后约时间 · 文字沟通 · 不满意可退', font=f(24, False), fill='#A99FB5', anchor='ma')
    img.save(os.path.join(OUT, '封面B-糖果.png'))


# ============ 封面 C：杂志极简 ============
def cover_magazine():
    img, d = canvas('#FFFFFF')
    d.rectangle([0, 0, W, 14], fill='#111111')
    d.text((80, 70), 'NO.01 ／ 装机咨询 ／ 2026', font=f(24, False), fill='#8A8A8A')

    d.text((80, 150), '她不是', font=f(120), fill='#111111')
    d.text((80, 292), '聊天框', font=f(120), fill='#111111')
    d.line([84, 440, 520, 440], fill='#111111', width=6)
    d.text((80, 480), '她是会记住你的角色。', font=f(44), fill='#111111')
    d.text((80, 548), '本地运行 · 性格可调 · 数据自己存', font=f(28, False), fill='#6A6A6A')

    d.text((80, 650), '¥9.9', font=f(150), fill='#111111')
    d.text((80, 830), '／ 15 分钟文字咨询', font=f(30, False), fill='#6A6A6A')

    d.rectangle([80, 900, W - 80, 902], fill='#E5E5E5')
    rows = [
        ('能判断', '你的机器够不够跑'),
        ('能算清', '一次性 + 每月大概多少'),
        ('能避开', '账号、隐私、内容边界'),
    ]
    y = 940
    for k, v in rows:
        d.text((80, y), k, font=f(32), fill='#111111')
        d.text((300, y + 4), v, font=f(30, False), fill='#5A5A5A')
        y += 74

    d.text((80, 1200), '已有可运行成品，不是概念稿。', font=f(34), fill='#111111')
    d.text((80, 1256), '本地版 / 云服务器版都能交付。', font=f(28, False), fill='#6A6A6A')
    d.text((W // 2, H - 56), '文字沟通 · 不一定装得成，先说清楚', font=f(24, False), fill='#9A9A9A', anchor='ma')
    img.save(os.path.join(OUT, '封面C-极简.png'))


cover_dark()
cover_candy()
cover_magazine()
print('封面 3 版完成')
