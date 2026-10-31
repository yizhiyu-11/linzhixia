# -*- coding: utf-8 -*-
"""大肥鱼封面 v2：三个排版方向，重点在字体/层级/配色。"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from make_cover_v3_lib import W, H, OUT, f, cutout, vgrad, glow  # noqa: E402
from PIL import Image, ImageDraw, ImageFilter  # noqa: E402

REF = os.path.join('docs', '商业', '参考形象', '大肥鱼', '参考1-趴着抱饭碗.jpg')
STHUPO = r'C:\Windows\Fonts\STHUPO.TTF'
DS_BLUE = (77, 107, 254)
PINK = (255, 61, 127)
INK = (36, 28, 54)


def acc(size):
    return f(size, family=STHUPO)


def char_layer(width_ratio=1.14, bottom_pad=10):
    ch = cutout(REF, thr=242)
    tw = int(W * width_ratio)
    th = int(ch.size[1] * tw / ch.size[0])
    ch = ch.resize((tw, th), Image.LANCZOS)
    return ch, int((W - tw) / 2), H - th + bottom_pad


def place_char(img, ch, x, y, shadow_color=(255, 205, 225), alpha=0.5):
    mask = Image.new('L', (W, H), 0)
    mask.paste(ch.getchannel('A'), (x, y + 18))
    mask = mask.filter(ImageFilter.GaussianBlur(26))
    img.paste(Image.new('RGB', (W, H), shadow_color), (0, 0), mask.point(lambda v: int(v * alpha)))
    img.paste(ch, (x, y), ch)


def sticker_badge(img, xy, text, bg, fg, size, angle=-6, pad=(30, 16), radius=26, stroke=None):
    fo = f(size, family=STHUPO)
    dummy = ImageDraw.Draw(Image.new('RGB', (10, 10)))
    tw = dummy.textlength(text, font=fo)
    bw, bh = int(tw + pad[0] * 2), int(size + pad[1] * 2)
    layer = Image.new('RGBA', (bw + 40, bh + 40), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle([20, 20, 20 + bw, 20 + bh], radius=radius, fill=bg,
                        outline=stroke, width=4 if stroke else 0)
    d.text((20 + pad[0], 20 + pad[1] - 6), text, font=fo, fill=fg)
    if angle:
        layer = layer.rotate(angle, expand=True, resample=Image.BICUBIC)
    img.paste(layer, (int(xy[0] - layer.width / 2), int(xy[1] - layer.height / 2)), layer)


# ─────────────── V1 贴纸风：白字粉描边 + 旋转印章 ───────────────
def v1():
    img = vgrad(W, H, '#FFEFF6', '#E8F6FF')
    img = glow(img, [-200, -180, 700, 520], '#FFD3E6', 190, 100)
    img = glow(img, [560, 640, 1320, 1480], '#D0EFFF', 200, 95)

    ch, cx, cy = char_layer(1.16)
    place_char(img, ch, cx, cy)

    d = ImageDraw.Draw(img)

    # 顶部小标
    sticker_badge(img, (250, 112), 'DEEPSEEK · 本地版', '#FFFFFF', DS_BLUE, 26, angle=-3, pad=(24, 12))

    # 主标题：白字 + 粉描边 + 投影
    d.text((70, 196), '把她装进', font=acc(112), fill='#FFFFFF',
           stroke_width=10, stroke_fill=PINK)
    d.text((70, 320), '你的电脑', font=acc(112), fill='#FFFFFF',
           stroke_width=10, stroke_fill=PINK)

    # 副文
    d.text((74, 460), '双击就能装 · 装完自己检查 · 卡住它自己修',
           font=f(31, False), fill='#6A5A76')

    # 气泡：她说的话
    bub = '她会在半夜问你：还没睡？'
    fo = f(28, False)
    tw = d.textlength(bub, font=fo)
    d.rounded_rectangle([70, 540, 70 + tw + 56, 540 + 66], radius=33, fill='#FFFFFF')
    d.polygon([(96, 606), (122, 606), (100, 634)], fill='#FFFFFF')
    d.text((98, 560), bub, font=fo, fill='#4A3E56')

    # 价格印章（旋转）
    sticker_badge(img, (250, 760), '¥19.9', '#241C36', '#FFFFFF', 76, angle=-7, pad=(34, 10))
    sticker_badge(img, (470, 700), '首发 10 个', PINK, '#FFFFFF', 24, angle=-7, pad=(20, 10))

    img.save(os.path.join(OUT, '封面-大肥鱼-V1贴纸.png'))
    print('  V1 ok')


# ─────────────── V2 杂志风：大黑字 + 细线 + 价格右下 ───────────────
def v2():
    img = Image.new('RGB', (W, H), '#FFF8FB')
    img = glow(img, [0, 500, 900, 1500], '#FFE6F0', 240, 90)
    img = glow(img, [700, -140, 1400, 500], '#E6F3FF', 220, 90)

    ch, cx, cy = char_layer(1.2)
    place_char(img, ch, cx, cy, (255, 220, 235), 0.6)

    d = ImageDraw.Draw(img)
    d.text((70, 110), 'DEEPSEEK 本地版', font=f(24, False), fill=DS_BLUE)
    d.line([(70, 152), (330, 152)], fill=DS_BLUE, width=3)

    d.text((66, 186), '把她装进', font=f(120), fill=INK)
    d.text((66, 318), '你的电脑', font=acc(124), fill=PINK)

    d.text((70, 470), '双击就能装', font=f(34), fill='#7A6A86')
    d.text((70, 520), '装完自己检查', font=f(34), fill='#7A6A86')
    d.text((70, 570), '卡住它自己修', font=f(34), fill='#7A6A86')

    # 右下价格卡（压在人物上方，半透明白）
    card = Image.new('RGBA', (420, 210), (255, 255, 255, 235))
    cd = ImageDraw.Draw(card)
    cd.rounded_rectangle([0, 0, 419, 209], radius=28, outline=(255, 200, 222), width=3)
    cd.text((32, 26), '首发 10 个', font=f(26, False), fill='#9A87A6')
    cd.text((30, 62), '¥', font=f(46), fill=PINK)
    cd.text((76, 56), '19.9', font=acc(96), fill=PINK)
    cd.text((32, 158), '装不上就退款', font=f(24, False), fill='#9A87A6')
    img.paste(card, (610, 430), card)

    img.save(os.path.join(OUT, '封面-大肥鱼-V2杂志.png'))
    print('  V2 ok')


# ─────────────── V3 糖果风：粉底 + 蓝字 + 圆角大卡 ───────────────
def v3():
    img = vgrad(W, H, '#FFE9F3', '#FFD9EA')
    img = glow(img, [200, -160, 1100, 620], '#FFF3FA', 200, 110)

    ch, cx, cy = char_layer(1.12)
    place_char(img, ch, cx, cy, (214, 120, 165), 0.45)

    # 顶部白色圆角卡
    card = Image.new('RGBA', (940, 520), (255, 255, 255, 242))
    cd = ImageDraw.Draw(card)
    cd.rounded_rectangle([0, 0, 939, 519], radius=44, fill=(255, 255, 255, 242))
    cd.text((56, 48), 'DEEPSEEK 装在自己电脑', font=f(24, False), fill=DS_BLUE)
    cd.text((54, 92), '把她装进', font=acc(104), fill=PINK)
    cd.text((54, 208), '你的电脑', font=acc(104), fill=PINK)
    cd.text((56, 336), '双击就能装 · 装完自己检查', font=f(28, False), fill='#7A6A86')
    cd.text((56, 382), '卡住它自己修', font=f(28, False), fill='#7A6A86')

    cd.rounded_rectangle([56, 434, 300, 494], radius=30, fill=PINK)
    cd.text((84, 448), '首发 ¥19.9', font=acc(30), fill='#FFFFFF')
    cd.text((322, 448), '装不上就退款', font=f(24, False), fill='#9A87A6')

    img.paste(card, (70, 90), card)
    img.save(os.path.join(OUT, '封面-大肥鱼-V3糖果.png'))
    print('  V3 ok')


if __name__ == '__main__':
    v1()
    v2()
    v3()
    print('done')
