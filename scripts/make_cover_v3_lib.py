# -*- coding: utf-8 -*-
"""封面脚本共用工具（从 make-cover-v3 抽出来）。"""
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
        mask = Image.new('L', canvas.size, 0)
        mask.paste(c.getchannel('A'), (x + 14, y + 18))
        mask = mask.filter(ImageFilter.GaussianBlur(18))
        dark = Image.new('RGBA', canvas.size, (0, 0, 0, 110))
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
