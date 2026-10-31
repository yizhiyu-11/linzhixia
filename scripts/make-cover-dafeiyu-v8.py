# -*- coding: utf-8 -*-
"""V8：修 V7 的底栏与荧光笔对齐。"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from make_cover_v3_lib import W, H, OUT, f, cutout  # noqa: E402
from PIL import Image, ImageDraw, ImageFilter  # noqa: E402

REF = os.path.join('docs', '商业', '参考形象', '大肥鱼', '参考1-趴着抱饭碗.jpg')
DS_BLUE = (77, 107, 254)
PINK = (255, 45, 118)
INK = (26, 20, 36)
YELLOW = (255, 226, 90)


def build():
    img = Image.new('RGB', (W, H), '#FFFDFE')

    # 先把文字量出来，荧光笔按文字宽度画
    probe = ImageDraw.Draw(Image.new('RGB', (8, 8)))
    t1, t2 = '把她装进', '你的电脑'
    f1, f2 = f(152), f(152)
    w1 = probe.textlength(t1, font=f1)
    w2 = probe.textlength(t2, font=f2)

    hl = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hl)
    hd.rounded_rectangle([52, 336, 60 + w2 + 24, 540], radius=10, fill=YELLOW + (225,))
    img.paste(hl, (0, 0), hl)

    ch = cutout(REF, thr=242)
    tw = int(W * 1.14)
    th = int(ch.size[1] * tw / ch.size[0])
    ch = ch.resize((tw, th), Image.LANCZOS)
    cx = int((W - tw) / 2)
    y = H - 190 - th + 90
    mask = Image.new('L', (W, H), 0)
    mask.paste(ch.getchannel('A'), (cx, y + 16))
    mask = mask.filter(ImageFilter.GaussianBlur(24))
    img.paste(Image.new('RGB', (W, H), (255, 208, 230)), (0, 0), mask.point(lambda v: int(v * 0.55)))
    img.paste(ch, (cx, y), ch)

    d = ImageDraw.Draw(img)
    d.text((66, 122), 'DEEPSEEK  本地版', font=f(26, False), fill=DS_BLUE)
    d.line([(66, 168), (392, 168)], fill=DS_BLUE, width=3)

    d.text((60, 188), t1, font=f1, fill=INK)
    d.text((60, 340), t2, font=f2, fill=PINK)

    d.text((66, 646), '双击就能装 · 卡住它自己修', font=f(30, False), fill='#7A6A86', stroke_width=6, stroke_fill='#FFFDFE')

    # 气泡
    fo = f(34)
    btxt = '你骂我也没用'
    btw = probe.textlength(btxt, font=fo)
    bw, bh = int(btw + 64), 78
    layer = Image.new('RGBA', (bw + 80, bh + 80), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    ld.rounded_rectangle([34, 34, 34 + bw, 34 + bh], radius=39, fill=INK)
    ld.polygon([(66, 34 + bh), (120, 34 + bh), (60, 34 + bh + 38)], fill=INK)
    ld.text((64, 52), btxt, font=fo, fill='#FFFFFF')
    layer = layer.rotate(-5, expand=True, resample=Image.BICUBIC)
    img.paste(layer, (int(820 - layer.width / 2), int(600 - layer.height / 2)), layer)

    # 底部横条
    d.rectangle([0, H - 160, W, H], fill=INK)
    d.text((58, H - 148), '¥', font=f(54), fill=(255, 255, 255))
    d.text((116, H - 176), '19.9', font=f(118), fill=(255, 255, 255))
    d.text((470, H - 132), '首发 10 个', font=f(30), fill=YELLOW)
    d.text((470, H - 92), '之后 29.9 · 装不上就退款', font=f(24, False), fill=(176, 164, 190))

    img.save(os.path.join(OUT, '封面-大肥鱼-V10.png'))
    print('  V8 ok')


if __name__ == '__main__':
    build()
