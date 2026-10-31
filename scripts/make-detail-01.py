# -*- coding: utf-8 -*-
"""详情图 01：自检四项（截图打码 key 后合成）。"""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1080, 1440
SHOT = 'docs/商业/截图/自检-四项全绿.png'
OUT = 'docs/商业/闲鱼图片/详情-01-自检.png'
FBD = r'C:\Windows\Fonts\msyhbd.ttc'
FRG = r'C:\Windows\Fonts\msyh.ttc'
BG = (247, 251, 255)
NAVY = (16, 42, 67)
BLUE = (43, 127, 214)
MINT = (127, 227, 224)
GREY = (107, 130, 153)


def f(sz, bold=True):
    return ImageFont.truetype(FBD if bold else FRG, sz)


def mask_key(im):
    """把 Key 那段换成「已填（已隐藏）」"""
    w, h = im.size
    box = (int(w * 0.32), int(h * 0.61), int(w * 0.47), int(h * 0.69))
    d = ImageDraw.Draw(im)
    d.rectangle(box, fill=(255, 255, 255))
    d.text((box[0] + 4, box[1] + 2), '已填（已隐藏）',
           font=ImageFont.truetype(FRG, 17), fill=(34, 160, 85))
    return im


def round_corners(im, r=18):
    mask = Image.new('L', im.size, 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, im.size[0], im.size[1]], radius=r, fill=255)
    out = im.convert('RGBA')
    out.putalpha(mask)
    return out


def build():
    img = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(img)

    # 顶部标题
    d.text((64, 96), '装完先看这个', font=f(76), fill=NAVY)
    d.text((64, 190), '四项全绿，才算装好', font=f(56), fill=BLUE)
    d.text((64, 268), '不用你猜“为什么她不回我”', font=f(30, False), fill=GREY)

    # 截图
    shot = Image.open(SHOT).convert('RGB')
    shot = shot.crop((0, 0, shot.size[0] - 12, shot.size[1] - 26))
    shot = mask_key(shot)
    card = Image.new('RGB', (shot.size[0] + 36, shot.size[1] + 36), (255, 255, 255))
    card.paste(shot, (18, 18))
    shot = card
    tw = 940
    th = int(shot.size[1] * tw / shot.size[0])
    shot = shot.resize((tw, th), Image.LANCZOS)
    shot = round_corners(shot, 18)

    x, y = (W - tw) // 2, 350
    # 阴影
    sh = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sh)
    sd.rounded_rectangle([x + 6, y + 14, x + tw + 6, y + th + 14], radius=18, fill=(16, 42, 67, 60))
    sh = sh.filter(ImageFilter.GaussianBlur(22))
    img.paste(sh, (0, 0), sh)
    img.paste(shot, (x, y), shot)

    # 标注
    d = ImageDraw.Draw(img)
    cy = y + th + 46
    d.rounded_rectangle([64, cy, 64 + 16, cy + 16], radius=8, fill=BLUE)
    d.text((96, cy - 8), '程序在跑：后台能打开就说明服务起来了', font=f(30, False), fill=NAVY)
    d.rounded_rectangle([64, cy + 62, 80, cy + 78], radius=8, fill=MINT)
    d.text((96, cy + 54), 'QQ 连上：连不上它会告诉你去点哪个按钮', font=f(30, False), fill=NAVY)
    d.rounded_rectangle([64, cy + 124, 80, cy + 140], radius=8, fill=(255, 196, 92))
    d.text((96, cy + 116), '白名单 + Key：这两项红了她不会回你', font=f(30, False), fill=NAVY)

    img.save(OUT)
    print('  saved', OUT, img.size)


if __name__ == '__main__':
    os.makedirs('docs/商业/闲鱼图片', exist_ok=True)
    build()
