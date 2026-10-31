# -*- coding: utf-8 -*-
"""用买家给的"大肥鱼"参考图直接合成封面（A 方案配色）。"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from make_cover_v3_lib import W, H, OUT, f, cutout, vgrad, glow  # noqa: E402
from PIL import Image, ImageDraw, ImageFilter  # noqa: E402

REF = os.path.join('docs', '商业', '参考形象', '大肥鱼', '参考1-趴着抱饭碗.jpg')
ACCENT = r'C:\Windows\Fonts\STHUPO.TTF'


def accent(size):
    return f(size, family=ACCENT)


def build():
    img = vgrad(W, H, '#FFF1F7', '#E9F6FF')
    img = glow(img, [-220, -180, 720, 560], '#FFD9EA', 180, 95)
    img = glow(img, [520, 700, 1340, 1520], '#D3F0FF', 190, 95)

    # 参考图抠白底
    ch = cutout(REF, thr=242)
    # 图比较宽（1120x630），按宽度铺到底部
    tw = int(W * 1.14)
    th = int(ch.size[1] * tw / ch.size[0])
    ch = ch.resize((tw, th), Image.LANCZOS)
    ch = ch.filter(ImageFilter.GaussianBlur(0.4))
    x = int((W - tw) / 2)
    y = H - th + 10

    # 底部柔和阴影
    mask = Image.new('L', (W, H), 0)
    mask.paste(ch.getchannel('A'), (x, y + 16))
    mask = mask.filter(ImageFilter.GaussianBlur(24))
    img.paste(Image.new('RGB', (W, H), (255, 210, 228)), (0, 0), mask.point(lambda v: int(v * 0.55)))
    img.paste(ch, (x, y), ch)

    d = ImageDraw.Draw(img)

    # 顶部标签
    d.rounded_rectangle([70, 86, 470, 146], radius=30, fill='#FF4F88')
    d.text((96, 100), 'DeepSeek · 装在自己电脑', font=f(28), fill='#FFFFFF')

    d.text((66, 178), '把她装进', font=f(100), fill='#241C36')
    d.text((66, 296), '你的电脑', font=accent(108), fill='#FF3D7F')

    d.text((70, 430), '双击就能装 · 装完自己检查 · 卡住它自己修', font=f(32, False), fill='#5B4C66')

    # 价格
    d.rounded_rectangle([70, 500, 470, 640], radius=32, fill='#241C36')
    d.text((96, 518), '首发 10 个', font=f(26, False), fill='#FFB7CE')
    d.text((96, 552), '¥19.9', font=f(64), fill='#FFFFFF')

    # 底部一句话
    d.rounded_rectangle([70, 690, 700, 762], radius=24, fill='#FFFFFF')
    d.text((94, 708), '她会在半夜问你一句：还没睡？', font=f(30, False), fill='#5A4C66')

    img.save(os.path.join(OUT, '封面-大肥鱼版-01.png'))
    print('  saved 封面-大肥鱼版-01.png')


if __name__ == '__main__':
    build()
