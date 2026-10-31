# -*- coding: utf-8 -*-
"""V7：V6 强化版——荧光笔收窄、价格变底部横条、人物上移露饭碗。"""
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


def char_img(ratio):
    ch = cutout(REF, thr=242)
    tw = int(W * ratio)
    th = int(ch.size[1] * tw / ch.size[0])
    return ch.resize((tw, th), Image.LANCZOS), int((W - tw) / 2), th


def bubble(img, text, xy, bg, fg, size=34, angle=-5):
    fo = f(size)
    tw = ImageDraw.Draw(Image.new('RGB', (8, 8))).textlength(text, font=fo)
    w, h = int(tw + 64), int(size + 44)
    layer = Image.new('RGBA', (w + 80, h + 80), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle([34, 34, 34 + w, 34 + h], radius=int(h / 2), fill=bg)
    d.polygon([(66, 34 + h), (120, 34 + h), (62, 34 + h + 40)], fill=bg)
    d.text((34 + 32, 34 + 14), text, font=fo, fill=fg)
    layer = layer.rotate(angle, expand=True, resample=Image.BICUBIC)
    img.paste(layer, (int(xy[0] - layer.width / 2), int(xy[1] - layer.height / 2)), layer)


def build():
    img = Image.new('RGB', (W, H), '#FFFDFE')

    # 荧光笔
    hl = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hl)
    hd.rounded_rectangle([52, 306, 690, 456], radius=14, fill=YELLOW + (205,))
    img.paste(hl, (0, 0), hl)

    # 人物（底部留 150 给横条）
    ch, cx, th = char_img(1.24)
    y = H - 150 - th + 30
    mask = Image.new('L', (W, H), 0)
    mask.paste(ch.getchannel('A'), (cx, y + 16))
    mask = mask.filter(ImageFilter.GaussianBlur(24))
    img.paste(Image.new('RGB', (W, H), (255, 208, 230)), (0, 0), mask.point(lambda v: int(v * 0.55)))
    img.paste(ch, (cx, y), ch)

    d = ImageDraw.Draw(img)
    d.text((66, 122), 'DEEPSEEK  本地版', font=f(26, False), fill=DS_BLUE)
    d.line([(66, 168), (392, 168)], fill=DS_BLUE, width=3)

    d.text((60, 188), '把她装进', font=f(152), fill=INK)
    d.text((60, 340), '你的电脑', font=f(152), fill=PINK)

    d.text((66, 526), '双击就能装 · 卡住它自己修', font=f(30, False), fill='#7A6A86')

    bubble(img, '你骂我也没用', (812, 566), INK, '#FFFFFF', 34, -5)

    # 底部价格横条
    d.rectangle([0, H - 150, W, H], fill=INK)
    d.text((64, H - 196), '首发 10 个', font=f(28, False), fill=(255, 197, 214))
    d.text((62, H - 148), '¥', font=f(58), fill=(255, 255, 255))
    d.text((124, H - 168), '19.9', font=f(116), fill=(255, 255, 255))
    d.text((470, H - 118), '装不上就退款 · 前 10 个之后 29.9', font=f(26, False), fill=(180, 168, 195))

    img.save(os.path.join(OUT, '封面-大肥鱼-V7.png'))
    print('  V7 ok')


if __name__ == '__main__':
    build()
