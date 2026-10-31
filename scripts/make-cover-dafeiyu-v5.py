# -*- coding: utf-8 -*-
"""大肥鱼封面 V5/V6：从 V2 杂志风出发，加强视觉冲击。"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from make_cover_v3_lib import W, H, OUT, f, cutout, vgrad, glow  # noqa: E402
from PIL import Image, ImageDraw, ImageFilter  # noqa: E402

REF = os.path.join('docs', '商业', '参考形象', '大肥鱼', '参考1-趴着抱饭碗.jpg')
STHUPO = r'C:\Windows\Fonts\STHUPO.TTF'
DS_BLUE = (77, 107, 254)
PINK = (255, 45, 118)
INK = (26, 20, 36)
YELLOW = (255, 214, 61)


def acc(size):
    return f(size, family=STHUPO)


def char_img(ratio, bottom=10):
    ch = cutout(REF, thr=242)
    tw = int(W * ratio)
    th = int(ch.size[1] * tw / ch.size[0])
    ch = ch.resize((tw, th), Image.LANCZOS)
    return ch, int((W - tw) / 2), H - th + bottom


def put_char(img, ch, x, y, shadow=(255, 200, 222), alpha=0.5):
    mask = Image.new('L', (W, H), 0)
    mask.paste(ch.getchannel('A'), (x, y + 16))
    mask = mask.filter(ImageFilter.GaussianBlur(24))
    img.paste(Image.new('RGB', (W, H), shadow), (0, 0), mask.point(lambda v: int(v * alpha)))
    img.paste(ch, (x, y), ch)


def rot(img, layer, xy):
    img.paste(layer, (int(xy[0] - layer.width / 2), int(xy[1] - layer.height / 2)), layer)


def bubble(img, text, xy, bg, fg, size=34, angle=-4, tail=True):
    fo = f(size)
    tw = ImageDraw.Draw(Image.new('RGB', (8, 8))).textlength(text, font=fo)
    w, h = int(tw + 64), int(size + 44)
    layer = Image.new('RGBA', (w + 60, h + 60), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle([30, 30, 30 + w, 30 + h], radius=int(h / 2), fill=bg)
    if tail:
        d.polygon([(60, 30 + h), (110, 30 + h), (58, 30 + h + 40)], fill=bg)
    d.text((30 + 32, 30 + 14), text, font=fo, fill=fg)
    layer = layer.rotate(angle, expand=True, resample=Image.BICUBIC)
    rot(img, layer, xy)


def price_big(img, xy, angle=-5):
    """超大字价格：¥19.9"""
    layer = Image.new('RGBA', (760, 320), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle([10, 20, 750, 300], radius=40, fill=(255, 255, 255, 250))
    d.text((48, 46), '首发 10 个', font=f(30, False), fill=(150, 136, 160))
    d.text((44, 78), '¥', font=f(74), fill=PINK)
    d.text((126, 58), '19.9', font=f(150), fill=PINK)
    d.text((48, 226), '装不上就退款', font=f(28, False), fill=(150, 136, 160))
    layer = layer.rotate(angle, expand=True, resample=Image.BICUBIC)
    rot(img, layer, xy)


# ───────── V5：玫红色块压白字 ─────────
def v5():
    img = vgrad(W, H, '#FFF4F9', '#FFE3F0')
    img = glow(img, [500, 480, 1300, 1300], '#FFD0E4', 200, 90)

    # 大色块（斜切）
    block = Image.new('RGBA', (W, 720), (0, 0, 0, 0))
    bd = ImageDraw.Draw(block)
    bd.polygon([(0, 0), (W, 0), (W - 120, 660), (0, 720)], fill=(255, 45, 118, 245))
    img.paste(block, (0, 0), block)

    d = ImageDraw.Draw(img)
    d.text((70, 96), 'DEEPSEEK · 装在自己电脑', font=f(26), fill=(255, 233, 240))

    d.text((64, 148), '把她装进', font=f(132), fill='#FFFFFF')
    d.text((64, 300), '你的电脑', font=acc(138), fill=YELLOW)

    # 气泡：你骂我也没用
    bubble(img, '你骂我也没用', (760, 470), YELLOW, INK, 38, -6)

    ch, cx, cy = char_img(1.18)
    put_char(img, ch, cx, cy, (255, 170, 205), 0.45)

    price_big(img, (330, 1010))

    img.save(os.path.join(OUT, '封面-大肥鱼-V5色块.png'))
    print('  V5 ok')


# ───────── V6：浅底 + 超大黑字 + 荧光笔 ─────────
def v6():
    img = Image.new('RGB', (W, H), '#FFFDFE')
    img = glow(img, [0, 600, 1000, 1600], '#FFE6F1', 240, 80)

    # 荧光笔色块（压在标题后两条）
    hl = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hl)
    hd.rounded_rectangle([54, 300, 900, 460], radius=16, fill=(255, 226, 90, 200))
    img.paste(hl, (0, 0), hl)

    d = ImageDraw.Draw(img)
    d.text((66, 120), 'DEEPSEEK  本地版', font=f(26, False), fill=DS_BLUE)
    d.line([(66, 166), (390, 166)], fill=DS_BLUE, width=3)

    d.text((60, 186), '把她装进', font=f(150), fill=INK)
    d.text((60, 336), '你的电脑', font=f(150), fill=PINK)

    bubble(img, '你骂我也没用', (800, 560), INK, '#FFFFFF', 34, -5)

    d.text((66, 520), '双击就能装 · 卡住它自己修', font=f(30, False), fill='#7A6A86')

    ch, cx, cy = char_img(1.22)
    put_char(img, ch, cx, cy, (255, 210, 230), 0.55)

    # 价格：压在人物脚边
    layer = Image.new('RGBA', (620, 210), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    ld.rounded_rectangle([6, 6, 614, 204], radius=36, fill=INK)
    ld.text((34, 26), '首发 10 个 · 装不上就退款', font=f(24, False), fill=(255, 197, 214))
    ld.text((30, 62), '¥', font=f(58), fill='#FFFFFF')
    ld.text((96, 44), '19.9', font=f(112), fill='#FFFFFF')
    rot(img, layer, (300, 1320))

    img.save(os.path.join(OUT, '封面-大肥鱼-V6荧光.png'))
    print('  V6 ok')


if __name__ == '__main__':
    v5()
    v6()
    print('done')
