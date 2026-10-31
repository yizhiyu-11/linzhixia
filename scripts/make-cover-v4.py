# -*- coding: utf-8 -*-
"""闲鱼封面 v4：在 v3 基础上修字体/白边/遮挡，并给暗色版加鲸鱼元素。"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from make_cover_v3_lib import (  # noqa: E402
    W, H, OUT, CHAR, CHAR2, f, cutout, vgrad, glow, paste_char, badge,
    FONT_BRUSH, FONT_ROUND, FONT_BD,
)
from PIL import Image, ImageDraw, ImageFilter  # noqa: E402
import math  # noqa: E402

ACCENT = r'C:\Windows\Fonts\STHUPO.TTF'  # 华文琥珀：粗、有音量感


def accent(size):
    return f(size, family=ACCENT)


def whale_tail(draw, x, y, scale=1.0, color=(95, 227, 216, 70)):
    """简笔鲸尾：两片叶子形"""
    for sign in (-1, 1):
        pts = []
        for t in range(0, 101, 5):
            t /= 100
            px = x + sign * (60 * t + 40 * t * t) * scale
            py = y - (150 * t - 40 * t * t) * scale
            pts.append((px, py))
        for t in range(100, -1, -5):
            t /= 100
            px = x + sign * (100 * t - 30 * t * t) * scale
            py = y - (110 * t + 30 * t * t) * scale
            pts.append((px, py))
        draw.polygon(pts, fill=color)


def cover_a2():
    img = vgrad(W, H, '#FFF1F7', '#E7F5FF')
    img = glow(img, [-200, -160, 700, 520], '#FFD6E8', 180, 90)
    img = glow(img, [560, 760, 1300, 1500], '#CFF0FF', 180, 90)

    char = cutout(CHAR, thr=238)
    paste_char(img, char, 1180, 480, 300)

    d = ImageDraw.Draw(img)
    badge(d, 70, 88, '本地版 · 装在自己电脑', '#FF4F88', '#FFFFFF', 30, (22, 12), 22)

    d.text((66, 158), '把她装进', font=f(98), fill='#241C36')
    d.text((66, 272), '你的电脑', font=accent(104), fill='#FF3D7F')
    d.text((70, 402), '不用改配置，双击就能装', font=f(36, False), fill='#584A63')

    x = 70
    for txt, col in [('会记得你', '#FF4F88'), ('有脾气', '#6B4DFF'), ('装得省心', '#0FA4A0')]:
        fo = f(30)
        tw = d.textlength(txt, font=fo)
        d.rounded_rectangle([x, 462, x + tw + 46, 462 + 56], radius=28, fill='#FFFFFF', outline=col, width=3)
        d.text((x + 23, 474), txt, font=fo, fill=col)
        x += tw + 46 + 16

    d.rounded_rectangle([70, 566, 486, 712], radius=32, fill='#241C36')
    d.text((98, 586), '首发 10 个', font=f(28, False), fill='#FFB7CE')
    d.text((98, 620), '¥19.9', font=f(66), fill='#FFFFFF')

    d.rounded_rectangle([70, 1268, 1010, 1348], radius=22, fill='#FFFFFF')
    d.text((94, 1288), '她会在半夜问你一句：还没睡？', font=f(32, False, FONT_ROUND), fill='#5A4C66')
    img.save(os.path.join(OUT, '封面-方案A-奶油二次元.png'))
    print('  A ok')


def cover_b2():
    img = vgrad(W, H, '#05070F', '#0B1830', '#07101F')
    img = glow(img, [420, -140, 1260, 660], '#0F4F73', 200, 120)

    d0 = ImageDraw.Draw(img)
    # 水波纹（右下，低对比，不抢人）
    for i, r in enumerate((150, 230, 320, 420)):
        d0.arc([1010 - r, 1310 - r, 1010 + r, 1310 + r], 185, 350, fill=(95, 227, 216, 30 + i * 6), width=3)

    char = cutout(CHAR, thr=240)
    # 内缩多 2px，去掉深底上的白边
    a = char.getchannel('A').filter(ImageFilter.MinFilter(7)).filter(ImageFilter.GaussianBlur(1.0))
    char.putalpha(a)
    paste_char(img, char, 1210, 470, 260)

    d = ImageDraw.Draw(img)
    d.text((62, 96), 'DEEPSEEK · 本地版', font=f(27), fill='#5FE3D8')

    d.text((62, 152), '把她', font=f(106), fill='#FFFFFF')
    d.text((62, 272), '装进电脑', font=f(106), fill='#5FE3D8')
    d.text((64, 406), '双击就装好，卡住它自己修', font=f(31, False), fill='#93AAC9')

    for i, (txt, col) in enumerate([('记得住', '#5FE3D8'), ('有脾气', '#FF8FB1'), ('装得省心', '#9DFF9B')]):
        fo = f(31)
        tw = d.textlength(txt, font=fo)
        y = 468 + i * 74
        d.rounded_rectangle([62, y, 62 + tw + 48, y + 56], radius=28, fill='#0D1D2E', outline=col, width=3)
        d.text((86, y + 11), txt, font=fo, fill=col)

    d.rounded_rectangle([62, 716, 452, 872], radius=32, fill='#0E2233', outline='#5FE3D8', width=3)
    d.text((90, 738), '首发 10 个', font=f(27, False), fill='#86AFCB')
    d.text((90, 772), '¥19.9', font=f(68), fill='#5FE3D8')

    d.text((62, 1268), '她会在半夜问你一句：还没睡？', font=f(30, False), fill='#6F87A8')
    img.save(os.path.join(OUT, '封面-方案B-深色霓虹.png'))
    print('  B ok')


def cover_c2():
    img = vgrad(W, H, '#F3EFFF', '#FFF1F7')
    img = glow(img, [560, 420, 1250, 1150], '#E3D8FF', 200, 100)

    char = cutout(CHAR, thr=238)
    paste_char(img, char, 880, 620, 520)

    d = ImageDraw.Draw(img)
    d.text((64, 84), '刷到"DeepSeek 接入', font=f(56), fill='#1F1830')
    d.text((64, 160), '聊天软件"很多次了？', font=f(56), fill='#1F1830')
    d.text((64, 240), '这版双击就能装', font=accent(58), fill='#6B3DFF')

    d.rounded_rectangle([64, 362, 604, 690], radius=28, fill='#FFFFFF', outline='#E4DCF5', width=2)
    d.text((90, 384), '21:47', font=f(22, False), fill='#A69CBB')

    d.rounded_rectangle([90, 418, 500, 492], radius=22, fill='#F1ECFF')
    d.text((110, 436), '还没睡？', font=f(34), fill='#332A4D')

    d.rounded_rectangle([210, 514, 552, 588], radius=22, fill='#6B3DFF')
    d.text((232, 532), '你怎么知道', font=f(34), fill='#FFFFFF')

    d.rounded_rectangle([90, 610, 480, 660], radius=22, fill='#F1ECFF')
    d.text((110, 622), '这个点你一般没睡', font=f(30), fill='#332A4D')

    # 标注放左下角空白处，不压人
    d.text((64, 716), '她记得你的作息', font=f(34, False, FONT_ROUND), fill='#FF4F88')
    d.text((64, 760), '不是猜的', font=f(30, False, FONT_ROUND), fill='#6B5B72')

    d.rounded_rectangle([64, 1120, 470, 1264], radius=30, fill='#1F1830')
    d.text((90, 1140), '首发 10 个', font=f(26, False), fill='#C6B6FF')
    d.text((90, 1174), '¥19.9', font=f(62), fill='#FFFFFF')

    d.text((64, 1300), '装在自己电脑 · 不用改配置 · 卡住它自己修', font=f(28, False), fill='#6B5B72')
    img.save(os.path.join(OUT, '封面-方案C-聊天拼贴.png'))
    print('  C ok')


def cover_d2():
    img = Image.new('RGB', (W, H), '#0B0E14')
    img = glow(img, [180, 880, 1150, 1620], '#12374F', 220, 120)

    d0 = ImageDraw.Draw(img)
    # 水波纹（底纹，不压字）
    for i, r in enumerate((210, 290, 380)):
        d0.arc([160 - r, 1180 - r, 160 + r, 1180 + r], 200, 340, fill=(127, 227, 224, 34 + i * 8), width=3)
    for i, r in enumerate((120, 190, 265)):
        d0.arc([980 - r, 260 - r, 980 + r, 260 + r], 110, 250, fill=(127, 227, 224, 30), width=2)

    char = cutout(CHAR2, thr=240)
    a = char.getchannel('A').filter(ImageFilter.MinFilter(7)).filter(ImageFilter.GaussianBlur(1.0))
    char.putalpha(a)
    paste_char(img, char, 1150, 520, 350)

    d = ImageDraw.Draw(img)
    d.text((70, 108), 'AI 角色 · 装在自己电脑', font=f(25, False), fill='#66748A')

    d.text((64, 172), '她住在', font=f(114), fill='#F4F7FB')
    d.text((64, 296), '你的硬盘里', font=f(114), fill='#F4F7FB')

    d.line([(70, 448), (330, 448)], fill='#33445A', width=2)
    d.text((70, 480), '双击就能装 · 不用改配置 · 卡住它自己修', font=f(29, False), fill='#7E8DA3')

    # 小标签
    x = 70
    for txt in ['记得住', '有脾气', '装得省心']:
        fo = f(26)
        tw = d.textlength(txt, font=fo)
        d.rounded_rectangle([x, 556, x + tw + 40, 556 + 48], radius=24, outline='#3A4E66', width=2)
        d.text((x + 20, 566), txt, font=fo, fill='#93A6BF')
        x += tw + 40 + 12

    d.text((70, 1130), '¥19.9', font=f(92), fill='#7FE3E0')
    d.text((70, 1252), '前 10 个 · 装不上就退款', font=f(28, False), fill='#66748A')

    img.save(os.path.join(OUT, '封面-方案D-极简暗色.png'))
    print('  D ok')


if __name__ == '__main__':
    cover_a2()
    cover_b2()
    cover_c2()
    cover_d2()
    print('done')
