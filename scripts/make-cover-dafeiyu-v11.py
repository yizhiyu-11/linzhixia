# -*- coding: utf-8 -*-
"""V11/V12：V10 版式不变，只换配色——鲸鱼娘的蓝/薄荷系。"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from make_cover_v3_lib import W, H, OUT, f, cutout  # noqa: E402
from PIL import Image, ImageDraw, ImageFilter  # noqa: E402

REF = os.path.join('docs', '商业', '参考形象', '大肥鱼', '参考1-趴着抱饭碗.jpg')

PALETTES = {
    'V11-蓝薄荷': dict(
        bg='#F4FBFF', bg2='#E6F6FF',
        t1='#16304F', t2='#2F6BFF', hl='#B9EFE6',
        sub='#6B8299', bar='#16304F',
        price='#FFFFFF', acc='#7FE3E0', small='#9FB3C8',
        bub_bg='#16304F', bub_fg='#FFFFFF',
    ),
    'V12-冰蓝': dict(
        bg='#F7FBFF', bg2='#E9F3FF',
        t1='#102A43', t2='#2B7FD6', hl='#CFE7FF',
        sub='#6B8299', bar='#1B3A5C',
        price='#FFFFFF', acc='#8FD3FF', small='#9FB3C8',
        bub_bg='#2B7FD6', bub_fg='#FFFFFF',
    ),
}


def build(name, c):
    img = Image.new('RGB', (W, H), c['bg'])

    probe = ImageDraw.Draw(Image.new('RGB', (8, 8)))
    t1, t2 = '把她装进', '你的电脑'
    f1 = f(152)
    w2 = probe.textlength(t2, font=f1)

    # 荧光笔只垫第二行
    hl = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hl)
    rgb = tuple(int(c['hl'][i:i + 2], 16) for i in (1, 3, 5))
    hd.rounded_rectangle([52, 336, 60 + w2 + 24, 540], radius=10, fill=rgb + (230,))
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
    img.paste(Image.new('RGB', (W, H), tuple(int(c['bg2'][i:i + 2], 16) for i in (1, 3, 5))),
              (0, 0), mask.point(lambda v: int(v * 0.75)))
    img.paste(ch, (cx, y), ch)

    d = ImageDraw.Draw(img)
    d.text((66, 122), 'DEEPSEEK  本地版', font=f(26, False), fill=c['t2'])
    d.line([(66, 168), (392, 168)], fill=c['t2'], width=3)

    d.text((60, 188), t1, font=f1, fill=c['t1'])
    d.text((60, 340), t2, font=f1, fill=c['t2'])
    d.text((66, 646), '双击就能装 · 卡住它自己修', font=f(30, False), fill=c['sub'])

    # 气泡
    fo = f(34)
    btxt = '你骂我也没用'
    btw = probe.textlength(btxt, font=fo)
    bw, bh = int(btw + 64), 78
    layer = Image.new('RGBA', (bw + 80, bh + 80), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    ld.rounded_rectangle([34, 34, 34 + bw, 34 + bh], radius=39, fill=c['bub_bg'])
    ld.polygon([(66, 34 + bh), (120, 34 + bh), (60, 34 + bh + 38)], fill=c['bub_bg'])
    ld.text((64, 52), btxt, font=fo, fill=c['bub_fg'])
    layer = layer.rotate(-5, expand=True, resample=Image.BICUBIC)
    img.paste(layer, (int(820 - layer.width / 2), int(600 - layer.height / 2)), layer)

    # 底部横条
    d.rectangle([0, H - 160, W, H], fill=c['bar'])
    d.text((58, H - 148), '¥', font=f(54), fill=c['price'])
    d.text((116, H - 176), '19.9', font=f(118), fill=c['price'])
    d.text((470, H - 132), '首发 10 个', font=f(30), fill=c['acc'])
    d.text((470, H - 92), '之后 29.9 · 装不上就退款', font=f(24, False), fill=c['small'])

    img.save(os.path.join(OUT, '封面-大肥鱼-%s.png' % name))
    print('  %s ok' % name)


if __name__ == '__main__':
    for k, v in PALETTES.items():
        build(k, v)
    print('done')
