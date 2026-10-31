# -*- coding: utf-8 -*-
"""把生成的角色图抠出来，合成二次元封面。

用法：python make-cover-from-png.py 角色图.png 输出名.png [dark|light]
"""
import sys
import os
from collections import deque
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1080, 1440


def f(size, bold=True):
    return ImageFont.truetype(r'C:\Windows\Fonts\msyhbd.ttc' if bold else r'C:\Windows\Fonts\msyh.ttc', size)


def cutout(path, white_thr=232, feather=2):
    """抠掉与边缘连通的白色背景（保留角色身上的白色衣服）。"""
    im = Image.open(path).convert('RGB')
    arr = np.asarray(im).astype(np.int16)
    h, w, _ = arr.shape

    near_white = (arr[:, :, 0] > white_thr) & (arr[:, :, 1] > white_thr) & (arr[:, :, 2] > white_thr)

    visited = np.zeros((h, w), dtype=bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if near_white[y, x] and not visited[y, x]:
                visited[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if near_white[y, x] and not visited[y, x]:
                visited[y, x] = True
                q.append((y, x))

    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and near_white[ny, nx]:
                visited[ny, nx] = True
                q.append((ny, nx))

    alpha = Image.fromarray(np.where(visited, 0, 255).astype(np.uint8))
    # 向内收 2px，去掉抠图留下的白边
    alpha = alpha.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(1.2))
    out = np.dstack([np.asarray(im).astype(np.uint8), np.asarray(alpha)])
    return Image.fromarray(out, 'RGBA')


def vgrad(size, c1, c2):
    w, h = size
    img = Image.new('RGB', (1, h))
    p = img.load()
    a = Image.new('RGB', (1, 1), c1).getpixel((0, 0))
    b = Image.new('RGB', (1, 1), c2).getpixel((0, 0))
    for i in range(h):
        t = i / max(1, h - 1)
        p[0, i] = tuple(int(a[k] + (b[k] - a[k]) * t) for k in range(3))
    return img.resize((w, h))


def build(char_path, out_path, theme='dark'):
    bg_top, bg_bot = ('#06162E', '#0B0F1A') if theme == 'dark' else ('#FFF7FB', '#E6F4F7')
    ink = '#FFFFFF' if theme == 'dark' else '#12303A'
    sub = '#9FC6E8' if theme == 'dark' else '#5E7A86'
    acc = '#5FE3D8' if theme == 'dark' else '#0E9C9C'

    img = vgrad((W, H), bg_top, bg_bot)

    # 光斑
    glow = Image.new('RGB', (W, H), bg_top)
    gd = ImageDraw.Draw(glow)
    gd.ellipse([480, -120, 1240, 620], fill='#0E4C63' if theme == 'dark' else '#CFF3F6')
    glow = glow.filter(ImageFilter.GaussianBlur(180))
    img = Image.blend(img, glow, 0.5 if theme == 'dark' else 0.35)

    char = cutout(char_path)
    # 缩放到高度约 1180
    target_h = 1060
    ratio = target_h / char.size[1]
    char = char.resize((int(char.size[0] * ratio), target_h), Image.LANCZOS)
    x = W - char.size[0] + 24
    if x < 300:
        x = 300
    y = H - char.size[1] - 60
    img.paste(char, (x, y), char)

    # 底部渐变，压住人物，保证文字可读
    fade = Image.new('L', (W, 260), 0)
    fd = ImageDraw.Draw(fade)
    for i in range(260):
        fd.line([(0, i), (W, i)], fill=int(230 * (i / 259) ** 0.8))
    dark = Image.new('RGB', (W, 260), '#06111F' if theme == 'dark' else '#FFFFFF')
    img.paste(dark, (0, H - 260), fade)

    d = ImageDraw.Draw(img)
    d.text((70, 96), 'AI COMPANION · 本地部署' if theme == 'dark' else 'AI 伴侣 · 本地部署', font=f(24), fill=acc)
    d.text((70, 150), '养一只', font=f(78), fill=ink)
    d.text((70, 246), '鲸鱼娘', font=f(78), fill=acc)
    d.text((70, 344), '住进你的电脑', font=f(50), fill=ink)
    d.text((70, 424), '会记得你说过的话，\n有自己的脾气。', font=f(27, False), fill=sub)

    d.rounded_rectangle([70, 566, 512, 776], radius=32, fill='#0F1B2E' if theme == 'dark' else '#FFFFFF')
    d.text((106, 592), '装机咨询 · 文字', font=f(24, False), fill=sub)
    d.text((106, 628), '¥9.9', font=f(80), fill=acc)
    d.text((106, 722), '15 分钟 · 给结论', font=f(23, False), fill=sub)

    y2 = 812
    labels = [('记得住', '#5FE3D8'), ('有性格', '#FFB3C7'), ('数据本地', '#9DFFC4')]
    x2 = 70
    for label, col in labels:
        fo = f(25)
        tw = d.textlength(label, font=fo)
        d.rounded_rectangle([x2, y2, x2 + tw + 42, y2 + 60], radius=30, outline=col, width=2)
        d.text((x2 + 21, y2 + 16), label, font=fo, fill=col)
        x2 += tw + 42 + 14

    d.text((70, 1188), '已有成品，装上就能聊', font=f(33), fill=ink)
    d.text((70, 1242), '本地 / 云服务器都能跑', font=f(24, False), fill=sub)
    d.text((70, H - 74), '全程文字沟通 · 不满意可退', font=f(23, False), fill=sub)
    img.save(out_path)
    print('saved', out_path)


if __name__ == '__main__':
    src = sys.argv[1]
    out = sys.argv[2]
    theme = sys.argv[3] if len(sys.argv) > 3 else 'dark'
    build(src, out, theme)
