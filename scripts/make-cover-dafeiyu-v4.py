# -*- coding: utf-8 -*-
"""V4：V1 贴纸风 + 干净数字 + 价格挪到右上。"""
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


def rot_paste(img, layer, xy):
    img.paste(layer, (int(xy[0] - layer.width / 2), int(xy[1] - layer.height / 2)), layer)


def price_sticker(img):
    """价格贴纸：黑底圆角，¥ 和数字都用雅黑加粗，数字很大。"""
    Wd, Hd = 430, 250
    pad = 40
    layer = Image.new('RGBA', (Wd + pad * 2, Hd + pad * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle([pad, pad, pad + Wd, pad + Hd], radius=34, fill=INK)

    d.text((pad + 30, pad + 22), '首发 10 个', font=f(26, False), fill=(255, 183, 206))

    # ¥ 用雅黑，数字用雅黑粗体
    yf = f(58)
    nf = f(96)
    d.text((pad + 30, pad + 66), '¥', font=yf, fill=(255, 255, 255))
    d.text((pad + 92, pad + 40), '19.9', font=nf, fill=(255, 255, 255))

    d.text((pad + 30, pad + 168), '装不上就退款', font=f(24, False), fill=(168, 158, 180))

    layer = layer.rotate(-7, expand=True, resample=Image.BICUBIC)
    rot_paste(img, layer, (830, 330))


def build():
    img = vgrad(W, H, '#FFEFF6', '#E8F6FF')
    img = glow(img, [-200, -180, 700, 520], '#FFD3E6', 190, 100)
    img = glow(img, [560, 640, 1320, 1480], '#D0EFFF', 200, 95)

    ch = cutout(REF, thr=242)
    tw = int(W * 1.16)
    th = int(ch.size[1] * tw / ch.size[0])
    ch = ch.resize((tw, th), Image.LANCZOS)
    cx, cy = int((W - tw) / 2), H - th + 10

    mask = Image.new('L', (W, H), 0)
    mask.paste(ch.getchannel('A'), (cx, cy + 18))
    mask = mask.filter(ImageFilter.GaussianBlur(26))
    img.paste(Image.new('RGB', (W, H), (255, 205, 225)), (0, 0), mask.point(lambda v: int(v * 0.5)))
    img.paste(ch, (cx, cy), ch)

    d = ImageDraw.Draw(img)

    # 顶部标签
    d.rounded_rectangle([70, 92, 486, 152], radius=30, fill='#FFFFFF')
    d.text((96, 106), 'DEEPSEEK · 装在自己电脑', font=f(27), fill=DS_BLUE)

    # 主标题：白字 + 粉描边（这是最抓眼的一层）
    d.text((66, 190), '把她装进', font=acc(116), fill='#FFFFFF', stroke_width=11, stroke_fill=PINK)
    d.text((66, 318), '你的电脑', font=acc(116), fill='#FFFFFF', stroke_width=11, stroke_fill=PINK)

    # 副文
    d.text((72, 466), '双击就能装 · 装完自己检查 · 卡住它自己修', font=f(30, False), fill='#6A5A76')

    # 气泡
    bub = '她会在半夜问你：还没睡？'
    fo = f(28, False)
    tw2 = d.textlength(bub, font=fo)
    d.rounded_rectangle([70, 546, 70 + tw2 + 56, 546 + 66], radius=33, fill='#FFFFFF')
    d.polygon([(100, 610), (128, 610), (104, 640)], fill='#FFFFFF')
    d.text((98, 566), bub, font=fo, fill='#4A3E56')

    price_sticker(img)

    img.save(os.path.join(OUT, '封面-大肥鱼-V4.png'))
    print('  V4 ok')


if __name__ == '__main__':
    build()
