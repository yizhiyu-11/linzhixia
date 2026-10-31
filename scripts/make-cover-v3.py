# -*- coding: utf-8 -*-
"""闲鱼封面 v3：4 个方案，1080x1440。

用法：python make-cover-v3.py
输出：docs/商业/闲鱼图片/封面-方案A.png ... 方案D.png
"""
import os
from collections import deque

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1080, 1440
OUT = os.path.join('docs', '商业', '闲鱼图片')
CHAR = os.path.join('docs', '商业', '角色', '角色-社区风-03-挥手.png')
CHAR2 = os.path.join('docs', '商业', '角色', '角色-青绿卫衣-02-白底右构图.png')

FONT_BD = r'C:\Windows\Fonts\msyhbd.ttc'
FONT_RG = r'C:\Windows\Fonts\msyh.ttc'
FONT_ROUND = r'C:\Windows\Fonts\simyou.ttf'
FONT_BRUSH = r'C:\Windows\Fonts\STCAIYUN.TTF'


def f(size, bold=True, family=None):
    path = family or (FONT_BD if bold else FONT_RG)
    return ImageFont.truetype(path, size)


def cutout(path, thr=232):
    """抠白底（从边缘连通），保留角色身上的白色"""
    im = Image.open(path).convert('RGB')
    arr = np.asarray(im).astype(np.int16)
    h, w, _ = arr.shape
    white = (arr[:, :, 0] > thr) & (arr[:, :, 1] > thr) & (arr[:, :, 2] > thr)
    seen = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if white[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if white[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not seen[ny, nx] and white[ny, nx]:
                seen[ny, nx] = True
                q.append((ny, nx))
    a = Image.fromarray(np.where(seen, 0, 255).astype(np.uint8))
    a = a.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(1.2))
    return Image.fromarray(np.dstack([np.asarray(im), np.asarray(a)]), 'RGBA')


def vgrad(w, h, c1, c2, c3=None):
    img = Image.new('RGB', (1, h))
    p = img.load()
    a = Image.new('RGB', (1, 1), c1).getpixel((0, 0))
    b = Image.new('RGB', (1, 1), c2).getpixel((0, 0))
    for i in range(h):
        t = i / max(1, h - 1)
        if c3 is None:
            p[0, i] = tuple(int(a[k] + (b[k] - a[k]) * t) for k in range(3))
        else:
            cc = Image.new('RGB', (1, 1), c3).getpixel((0, 0))
            if t < 0.5:
                u = t / 0.5
                p[0, i] = tuple(int(a[k] + (cc[k] - a[k]) * u) for k in range(3))
            else:
                u = (t - 0.5) / 0.5
                p[0, i] = tuple(int(cc[k] + (b[k] - cc[k]) * u) for k in range(3))
    return img.resize((w, h))


def glow(img, box, color, blur=140, alpha=110):
    layer = Image.new('RGB', img.size, (0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse(box, fill=color)
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    mask = layer.convert('L').point(lambda v: int(v * alpha / 255))
    img.paste(Image.composite(layer, img, mask), (0, 0))
    return img


def paste_char(canvas, char, height, x, y, shadow=True):
    ratio = height / char.size[1]
    c = char.resize((int(char.size[0] * ratio), height), Image.LANCZOS)
    if shadow:
        sh = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(sh)
        d.bitmap((0, 0), Image.new('L', canvas.size, 0))
        mask = Image.new('L', canvas.size, 0)
        mask.paste(c.getchannel('A'), (x + 14, y + 18))
        mask = mask.filter(ImageFilter.GaussianBlur(18))
        dark = Image.new('RGBA', canvas.size, (0, 0, 0, 120))
        canvas.paste(dark, (0, 0), mask)
    canvas.paste(c, (x, y), c)
    return canvas


def badge(draw, x, y, text, bg, fg, size=42, pad=(28, 16), radius=28):
    fo = f(size)
    tw = draw.textlength(text, font=fo)
    box = [x, y, x + tw + pad[0] * 2, y + size + pad[1] * 2]
    draw.rounded_rectangle(box, radius=radius, fill=bg)
    draw.text((x + pad[0], y + pad[1] - 4), text, font=fo, fill=fg)
    return box


# ───────────────────────── 方案 A：奶油二次元 ─────────────────────────
def cover_a():
    img = vgrad(W, H, '#FFF3F8', '#EAF6FF')
    img = glow(img, [-200, -160, 700, 520], '#FFD6E8', 180, 90)
    img = glow(img, [560, 700, 1300, 1450], '#CFF0FF', 180, 90)

    char = cutout(CHAR)
    paste_char(img, char, 1180, 470, 300)

    d = ImageDraw.Draw(img)
    # 顶部小标签
    badge(d, 70, 84, '本地版 · 装在自己电脑', '#FF6E9C', '#FFFFFF', 30, (22, 12), 22)

    d.text((68, 150), '把她装进', font=f(96), fill='#2B2140')
    d.text((68, 258), '你的电脑', font=f(96, family=FONT_BRUSH), fill='#FF4F88')

    d.text((70, 380), '不用改配置，双击就能装', font=f(36, False), fill='#6B5B72')

    # 三个标签
    x = 70
    for txt, col in [('会记得你', '#FF6E9C'), ('有脾气', '#7B61FF'), ('不用月费', '#1FB6A6')]:
        fo = f(30)
        tw = d.textlength(txt, font=fo)
        d.rounded_rectangle([x, 440, x + tw + 44, 440 + 54], radius=27, outline=col, width=3)
        d.text((x + 22, 452), txt, font=fo, fill=col)
        x += tw + 44 + 16

    # 价格贴纸
    d.rounded_rectangle([70, 560, 470, 700], radius=30, fill='#2B2140')
    d.text((96, 580), '首发 10 个', font=f(28, False), fill='#FFC2D8')
    d.text((96, 612), '¥19.9', font=f(64), fill='#FFFFFF')

    d.text((70, 1300), '她会在半夜问你一句：还没睡？', font=f(32, False, FONT_ROUND), fill='#6B5B72')
    img.save(os.path.join(OUT, '封面-方案A-奶油二次元.png'))
    print('  A ok')


# ───────────────────────── 方案 B：深色霓虹 ─────────────────────────
def cover_b():
    img = vgrad(W, H, '#070B18', '#0C1B33', '#081226')
    img = glow(img, [420, -120, 1240, 640], '#12557A', 200, 120)
    img = glow(img, [-180, 900, 420, 1500], '#2A1E5C', 200, 110)

    char = cutout(CHAR)
    paste_char(img, char, 1220, 460, 250)

    d = ImageDraw.Draw(img)
    d.text((64, 96), 'DEEPSEEK · 本地版', font=f(28), fill='#5FE3D8')

    d.text((64, 150), '把她', font=f(104), fill='#FFFFFF')
    d.text((64, 268), '装进电脑', font=f(104), fill='#5FE3D8')

    d.text((66, 400), '双击就装好，卡住它自己修', font=f(32, False), fill='#9FB6D8')

    for i, (txt, col) in enumerate([('记得住', '#5FE3D8'), ('有脾气', '#FF8FB1'), ('不用月费', '#9DFF9B')]):
        badge(d, 64, 470 + i * 76, txt, None, col, 32) if False else None
        fo = f(32)
        tw = d.textlength(txt, font=fo)
        d.rounded_rectangle([64, 470 + i * 76, 64 + tw + 50, 470 + i * 76 + 58], radius=29, outline=col, width=3)
        d.text((89, 483 + i * 76), txt, font=fo, fill=col)

    d.rounded_rectangle([64, 730, 430, 880], radius=32, fill='#0F2233', outline='#5FE3D8', width=3)
    d.text((92, 752), '首发 10 个', font=f(28, False), fill='#8FB6D0')
    d.text((92, 786), '¥19.9', font=f(66), fill='#5FE3D8')

    d.text((64, 1300), '她会在半夜问你一句：还没睡？', font=f(30, False), fill='#7C93B3')
    img.save(os.path.join(OUT, '封面-方案B-深色霓虹.png'))
    print('  B ok')


# ───────────────────────── 方案 C：聊天截图拼贴 ─────────────────────────
def cover_c():
    img = vgrad(W, H, '#F4F0FF', '#FFF0F6')
    img = glow(img, [500, 300, 1200, 1100], '#E4D9FF', 200, 100)

    char = cutout(CHAR)
    paste_char(img, char, 900, 590, 480)

    d = ImageDraw.Draw(img)
    # 大标题
    d.text((64, 90), '刷到"DeepSeek 接入', font=f(58), fill='#221B33')
    d.text((64, 168), '聊天软件"很多次了？', font=f(58), fill='#221B33')
    d.text((64, 252), '这版双击就能装', font=f(58, family=FONT_BRUSH), fill='#7B4DFF')

    # 聊天窗
    box = [64, 380, 620, 700]
    d.rounded_rectangle(box, radius=28, fill='#FFFFFF', outline='#E6DFF5', width=2)
    d.text((92, 404), '21:47', font=f(22, False), fill='#A99FBF')
    # 她的气泡
    b1 = [92, 440, 520, 512]
    d.rounded_rectangle(b1, radius=22, fill='#F1ECFF')
    d.text((112, 458), '还没睡？', font=f(34), fill='#3A2E55')
    # 用户气泡
    b2 = [220, 534, 560, 606]
    d.rounded_rectangle(b2, radius=22, fill='#7B4DFF')
    d.text((242, 552), '你怎么知道', font=f(34), fill='#FFFFFF')
    # 再一条
    b3 = [92, 628, 500, 676]
    d.rounded_rectangle(b3, radius=22, fill='#F1ECFF')
    d.text((112, 640), '你房间灯还亮着', font=f(30), fill='#3A2E55')

    # 手写标注
    d.text((650, 700), '她记得', font=f(40, family=FONT_BRUSH), fill='#FF5C8A')
    d.text((650, 752), '你还在电脑前', font=f(34, False, FONT_ROUND), fill='#6B5B72')

    # 价格
    d.rounded_rectangle([64, 1090, 470, 1230], radius=30, fill='#221B33')
    d.text((90, 1110), '首发 10 个', font=f(26, False), fill='#C9B8FF')
    d.text((90, 1144), '¥19.9', font=f(62), fill='#FFFFFF')

    d.text((64, 1300), '装在自己电脑 · 不用改配置 · 不交月费', font=f(30, False), fill='#6B5B72')
    img.save(os.path.join(OUT, '封面-方案C-聊天拼贴.png'))
    print('  C ok')


# ───────────────────────── 方案 D：极简大字 ─────────────────────────
def cover_d():
    img = Image.new('RGB', (W, H), '#0E1117')
    img = glow(img, [200, 900, 1100, 1600], '#1B3A5C', 220, 110)

    char = cutout(CHAR2)
    paste_char(img, char, 1150, 520, 340)

    d = ImageDraw.Draw(img)
    d.text((70, 110), 'AI 角色 · 装在自己电脑', font=f(26, False), fill='#6E7C91')

    d.text((66, 176), '她住在', font=f(112), fill='#F2F5F9')
    d.text((66, 300), '你的硬盘里', font=f(112), fill='#F2F5F9')

    d.line([(70, 450), (300, 450)], fill='#3C4A5E', width=2)
    d.text((70, 480), '双击就能装 · 不用改配置 · 卡住它自己修', font=f(30, False), fill='#8B99AD')

    d.text((70, 1170), '¥19.9', font=f(88), fill='#7FE3E0')
    d.text((70, 1288), '前 10 个 · 装不上就退款', font=f(28, False), fill='#6E7C91')

    img.save(os.path.join(OUT, '封面-方案D-极简暗色.png'))
    print('  D ok')


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    cover_a()
    cover_b()
    cover_c()
    cover_d()
    print('done')
