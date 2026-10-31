# -*- coding: utf-8 -*-
"""详情图 D1-D3：聊天截图风（精确排版）。"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from make_cover_v3_lib import W, H  # noqa: E402
from PIL import Image, ImageDraw, ImageFilter, ImageFont  # noqa: E402

OUT = 'docs/商业/闲鱼图片'
SHOT_DIR = 'docs/商业/截图'
AVATAR_SRC = 'docs/商业/参考形象/大肥鱼/参考1-趴着抱饭碗.jpg'

BG = (247, 251, 255)
NAVY = (16, 42, 67)
BLUE = (43, 127, 214)
GREY = (107, 130, 153)
LINE = (226, 236, 245)

FB = r'C:\Windows\Fonts\msyhbd.ttc'
FR = r'C:\Windows\Fonts\msyh.ttc'
CARD_W = 940
PAD = 26
BUB_FONT = ImageFont.truetype(FR, 30)
TIME_FONT = ImageFont.truetype(FR, 20)
NAME_FONT = ImageFont.truetype(FB, 28)
MAXB = int(CARD_W * 0.60)


def wrap(text, font, maxw):
    tmp = ImageDraw.Draw(Image.new('RGB', (8, 8)))
    lines, cur = [], ''
    for ch in text:
        if ch == '\n':
            lines.append(cur)
            cur = ''
            continue
        if tmp.textlength(cur + ch, font=font) > maxw and cur:
            lines.append(cur)
            cur = ch
        else:
            cur += ch
    if cur:
        lines.append(cur)
    return lines or ['']


def her_avatar(size=66):
    im = Image.open(AVATAR_SRC).convert('RGB')
    w, h = im.size
    box = (int(w * 0.31), int(h * 0.21), int(w * 0.61), int(h * 0.61))
    im = im.crop(box).resize((size, size), Image.LANCZOS)
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
    out = im.convert('RGBA')
    out.putalpha(mask)
    return out


def me_avatar(size=66):
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse([0, 0, size - 1, size - 1], fill=(214, 226, 238))
    # 简单人形
    d.ellipse([size * 0.33, size * 0.22, size * 0.67, size * 0.58], fill=(150, 170, 190))
    d.ellipse([size * 0.20, size * 0.55, size * 0.80, size * 1.05], fill=(150, 170, 190))
    return im


def layout(items):
    """items: [(role, text, time|None)] → [(kind, ...)] 带坐标"""
    plan = []
    y = 96
    for role, text, t in items:
        if t:
            plan.append(('time', t, y))
            y += 40
        lines = wrap(text, BUB_FONT, MAXB - 40)
        tw = max(BUB_FONT.getlength(l) for l in lines)
        bw = int(max(min(tw + 40, MAXB), 120))
        bh = len(lines) * 44 + 36
        plan.append(('msg', role, lines, bw, bh, y))
        y += bh + 26
    return plan, y + 26


def card_image(items, title='林知夏'):
    plan, total = layout(items)
    card = Image.new('RGBA', (CARD_W, total), (0, 0, 0, 0))
    d = ImageDraw.Draw(card)
    d.rounded_rectangle([0, 0, CARD_W - 1, total - 1], radius=28, fill=(255, 255, 255, 255))
    d.text((PAD, 24), title, font=NAME_FONT, fill=NAVY)
    d.line([(0, 76), (CARD_W, 76)], fill=LINE, width=2)

    av_her = her_avatar()
    av_me = me_avatar()

    for p in plan:
        if p[0] == 'time':
            _, t, y = p
            tw = TIME_FONT.getlength(t)
            d.text(((CARD_W - tw) / 2, y), t, font=TIME_FONT, fill=(168, 182, 196))
            continue
        _, role, lines, bw, bh, y = p
        if role == 'her':
            card.paste(av_her, (PAD, y + 2), av_her)
            bx = PAD + 78
            d.rounded_rectangle([bx, y, bx + bw, y + bh], radius=18, fill=(255, 255, 255),
                                outline=LINE, width=2)
            d.polygon([(bx, y + 20), (bx - 10, y + 28), (bx, y + 36)], fill=(255, 255, 255))
            d.line([(bx - 10, y + 28), (bx - 10, y + 28)], fill=(255, 255, 255))
            tx, ty, fill = bx + 20, y + 16, NAVY
        else:
            bx = CARD_W - PAD - 78 - bw
            d.rounded_rectangle([bx, y, bx + bw, y + bh], radius=18, fill=BLUE)
            d.polygon([(bx + bw, y + 20), (bx + bw + 10, y + 28), (bx + bw, y + 36)], fill=BLUE)
            card.paste(av_me, (CARD_W - PAD - 66, y + 2), av_me)
            tx, ty, fill = bx + 20, y + 16, (255, 255, 255)
        for l in lines:
            d.text((tx, ty), l, font=BUB_FONT, fill=fill)
            ty += 44
    return card


def build(name, title, subtitle, items, caption, footer=None):
    img = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(img)
    d.text((64, 92), title, font=ImageFont.truetype(FB, 70), fill=NAVY)
    if subtitle:
        d.text((64, 180), subtitle, font=ImageFont.truetype(FB, 44), fill=BLUE)
        d.text((64, 240), caption, font=ImageFont.truetype(FR, 30), fill=GREY)
        y0 = 310
    else:
        d.text((64, 186), caption, font=ImageFont.truetype(FR, 30), fill=GREY)
        y0 = 260

    card = card_image(items)
    x = (W - card.width) // 2
    sh = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sh)
    sd.rounded_rectangle([x + 6, y0 + 12, x + card.width + 6, y0 + card.height + 12],
                         radius=28, fill=(16, 42, 67, 55))
    sh = sh.filter(ImageFilter.GaussianBlur(20))
    img.paste(sh, (0, 0), sh)
    img.paste(card, (x, y0), card)

    if footer:
        d = ImageDraw.Draw(img)
        fy = y0 + card.height + 44
        for i, line in enumerate(footer):
            d.text((64, fy + i * 48), line, font=ImageFont.truetype(FR, 29), fill=NAVY)

    img.save(os.path.join(OUT, name))
    print('  saved', name)


if __name__ == '__main__':
    a = json.load(open(os.path.join(SHOT_DIR, '详情对话.json'), encoding='utf-8'))
    b = json.load(open(os.path.join(SHOT_DIR, '详情对话-补充.json'), encoding='utf-8'))

    build(
        '详情-01-她会怎么说话.png',
        '她会这样跟你说话',
        '不是客服腔',
        [
            ('me', '你是不是有点矮啊', '21:03'),
            ('her', a['d1'][1]['text'], None),
            ('me', '你哄我一下', '21:07'),
            ('her', b['pairs'][1]['her'], None),
            ('me', '我今天被领导骂了', '21:12'),
            ('her', b['pairs'][0]['her'], None),
        ],
        '她有自己的脾气：会顶你，也会接住你',
        footer=['回复会分条发，像真人在打字', '同一个人，语气每天不太一样'],
    )

    build(
        '详情-02-她记得住.png',
        '你随口说的，她记着',
        '隔了几句话，她还记得',
        [
            ('me', '最近老下雨 我膝盖有点疼', '20:41'),
            ('her', a['d2'][1]['text'], None),
            ('me', '晚上吃的泡面', '20:52'),
            ('her', a['d2'][3]['text'], None),
            ('me', '你还记得我上次说哪儿不舒服吗', '21:05'),
            ('her', a['d2'][5]['text'], None),
        ],
        '聊过的事会存下来，每天自己整理一遍',
        footer=['你提过的人、事、习惯，她都留着', '记录在你自己电脑上，随时能备份'],
    )

    # D3：气泡 + 三个时段状态卡
    img = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(img)
    d.text((64, 92), '她不是随时待命的客服', font=ImageFont.truetype(FB, 70), fill=NAVY)
    d.text((64, 180), '有自己的作息，也会突然想起你', font=ImageFont.truetype(FB, 44), fill=BLUE)
    d.text((64, 240), '那一刻她在家，衣服挑了一半', font=ImageFont.truetype(FR, 30), fill=GREY)

    card = card_image([('her', '困了就躺着想我', '23:47')])
    x = (W - card.width) // 2
    img.paste(card, (x, 300), card)

    states = [
        ('08:10', '刚起床，头发乱着', '在煮咖啡，等它滴完'),
        ('12:30', '在公司等外卖', '骑手在楼下绕圈'),
        ('18:40', '在通勤回家', '还有三站'),
        ('21:30', '窝在沙发上刷手机', '衣服泡在盆里还没洗'),
        ('01:12', '在厨房找吃的', '只剩泡面'),
    ]
    y = 300 + card.height + 36
    for tm, doing, note in states:
        d.rounded_rectangle([64, y, W - 64, y + 106], radius=20, fill=(255, 255, 255))
        d.text((92, y + 18), tm, font=ImageFont.truetype(FB, 30), fill=BLUE)
        d.text((200, y + 16), doing, font=ImageFont.truetype(FB, 32), fill=NAVY)
        d.text((200, y + 60), note, font=ImageFont.truetype(FR, 24), fill=GREY)
        y += 124

    d.text((64, y + 6), '一天里她会换六七种状态，时间对得上，不会自相矛盾',
           font=ImageFont.truetype(FR, 26), fill=GREY)
    img.save(os.path.join(OUT, '详情-03-她有自己的生活.png'))
    print('  saved 详情-03')
