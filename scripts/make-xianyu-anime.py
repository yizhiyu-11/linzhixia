# -*- coding: utf-8 -*-
"""二次元封面 v2：贴纸风 chibi 鲸鱼娘（纯矢量占位）。"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = r'E:\ai-gf\docs\商业\闲鱼图片'
os.makedirs(OUT, exist_ok=True)

W, H = 1080, 1440
SS = 4


def f(size, bold=True):
    return ImageFont.truetype(r'C:\Windows\Fonts\msyhbd.ttc' if bold else r'C:\Windows\Fonts\msyh.ttc', size)


def vgrad(size, c1, c2):
    w, h = size
    img = Image.new('RGB', (1, h))
    p = img.load()
    a = Image.new('RGB', (1, 1), c1).getpixel((0, 0))
    b = Image.new('RGB', (1, 1), c2).getpixel((0, 0))
    for i in range(h):
        t = i / max(1, h - 1)
        p[0, i] = tuple(int(a[k] + (b[k] - a[k]) * t) for k in range(3))
    return img.resize((w, h))


def glow(size, center, radius, color, strength=0.35, base='#000000'):
    layer = Image.new('RGB', size, base)
    d = ImageDraw.Draw(layer)
    d.ellipse([center[0] - radius, center[1] - radius, center[0] + radius, center[1] + radius], fill=color)
    return layer.filter(ImageFilter.GaussianBlur(radius * 0.6))


def chibi(size, palette='dark'):
    """贴纸风：大头、小身、鲸鱼尾鳍耳。返回 RGBA。"""
    w, h = size
    S = SS
    img = Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if palette == 'dark':
        hair, hair_sh, hair_hi = (126, 214, 245), (86, 176, 214), (186, 240, 255)
        skin, skin_sh = (255, 228, 213), (245, 198, 182)
        cloth, cloth_sh = (47, 107, 255), (36, 82, 214)
        eye = (30, 44, 78)
        blush = (255, 150, 170)
    else:
        hair, hair_sh, hair_hi = (143, 206, 255), (104, 168, 226), (200, 236, 255)
        skin, skin_sh = (255, 228, 213), (245, 198, 182)
        cloth, cloth_sh = (255, 141, 170), (228, 104, 134)
        eye = (56, 42, 76)
        blush = (255, 150, 170)

    cx = w // 2
    head_r = int(w * 0.30)
    hy = int(h * 0.34)

    def E(x, y, rx, ry, fill):
        d.ellipse([(x - rx) * S, (y - ry) * S, (x + rx) * S, (y + ry) * S], fill=fill)

    def R(x0, y0, x1, y1, r, fill):
        d.rounded_rectangle([x0 * S, y0 * S, x1 * S, y1 * S], radius=r * S, fill=fill)

    # ---- 尾鳍（身后，像鱼尾分叉）----
    tail_y = int(h * 0.80)
    for sign in (-1, 1):
        d.polygon([
            ((cx + sign * 20) * S, (tail_y - 40) * S),
            ((cx + sign * 132) * S, (tail_y - 6) * S),
            ((cx + sign * 176) * S, (tail_y + 34) * S),
            ((cx + sign * 60) * S, (tail_y + 60) * S),
        ], fill=hair_sh)

    # ---- 身体（帽衫）----
    body_top = hy + int(head_r * 0.78)
    R(cx - 96, body_top, cx + 96, body_top + 150, 46, cloth)
    # 帽兜领口
    E(cx, body_top + 12, 74, 26, cloth_sh)

    # 手臂
    R(cx - 132, body_top + 34, cx - 92, body_top + 128, 20, cloth)
    R(cx + 92, body_top + 34, cx + 132, body_top + 128, 20, cloth)
    # 手
    E(cx - 112, body_top + 134, 20, 20, skin)
    E(cx + 112, body_top + 134, 20, 20, skin)

    # 腿
    R(cx - 56, body_top + 140, cx - 16, body_top + 216, 18, skin_sh)
    R(cx + 16, body_top + 140, cx + 56, body_top + 216, 18, skin_sh)

    # ---- 头 ----
    E(cx, hy, head_r, head_r, skin)

    # 头发：后壳
    d.pieslice([(cx - head_r - 8) * S, (hy - head_r - 10) * S, (cx + head_r + 8) * S, (hy + head_r) * S],
               180, 360, fill=hair)
    # 刘海（三片）
    for i, (bx, bw, bh) in enumerate([(-0.62, 0.30, 0.34), (0.0, 0.32, 0.42), (0.62, 0.30, 0.34)]):
        x0 = cx + int(head_r * bx) - int(head_r * bw / 2)
        x1 = x0 + int(head_r * bw)
        d.polygon([(x0 * S, (hy - int(head_r * 0.45)) * S),
                   (x1 * S, (hy - int(head_r * 0.45)) * S),
                   (((x0 + x1) // 2) * S, (hy + int(head_r * bh) - int(head_r * 0.55)) * S)], fill=hair)
    # 侧发（垂到肩膀）
    for sign in (-1, 1):
        R(cx + sign * (head_r - 18) - 34, hy - 40, cx + sign * (head_r - 18) + 34, hy + head_r + 40, 32, hair)
    # 高光
    d.arc([(cx - head_r + 22) * S, (hy - head_r + 16) * S, (cx + 40) * S, (hy - int(head_r * 0.2)) * S],
          200, 330, fill=hair_hi, width=10 * S)
    # 呆毛
    d.line([(cx + 10) * S, (hy - head_r + 6) * S, (cx + 46) * S, (hy - head_r - 46) * S], fill=hair, width=12 * S)

    # 鲸鱼尾鳍耳（贴在头两侧）
    for sign in (-1, 1):
        d.polygon([
            ((cx + sign * (head_r - 6)) * S, (hy - 34) * S),
            ((cx + sign * (head_r + 62)) * S, (hy - 74) * S),
            ((cx + sign * (head_r + 70)) * S, (hy - 6) * S),
            ((cx + sign * (head_r + 6)) * S, (hy + 26) * S),
        ], fill=hair_sh)

    # ---- 脸 ----
    # 眼
    for sign in (-1, 1):
        ex = cx + sign * int(head_r * 0.40)
        ey = hy + int(head_r * 0.12)
        E(ex, ey, 30, 40, eye)
        E(ex - 8, ey - 12, 12, 15, (255, 255, 255))
        E(ex + 8, ey + 14, 8, 9, (255, 255, 255, 190))
        # 睫毛
        d.arc([(ex - 34) * S, (ey - 46) * S, (ex + 34) * S, (ey + 10) * S], 200, 340, fill=(20, 26, 44), width=6 * S)
    # 腮红
    for sign in (-1, 1):
        bx = cx + sign * int(head_r * 0.60)
        d.ellipse([(bx - 30) * S, (hy + int(head_r * 0.40)) * S, (bx + 30) * S, (hy + int(head_r * 0.56)) * S], fill=blush)
    # 嘴（ω）
    my = hy + int(head_r * 0.52)
    for sign in (-1, 1):
        d.arc([(cx + sign * 16 - 16) * S, (my - 10) * S, (cx + sign * 16 + 16) * S, (my + 14) * S],
              0, 180, fill=(196, 104, 122), width=5 * S)
    # 鼻子点
    E(cx, hy + int(head_r * 0.30), 4, 4, (240, 190, 175))

    # ---- 头顶喷水 ----
    for dx, dy, r in [(-22, -1.16, 13), (0, -1.30, 18), (22, -1.16, 13)]:
        E(cx + dx, hy + int(head_r * dy), r, r, (200, 242, 255, 230))
    for dx, dy, r in [(-38, -1.06, 8), (38, -1.06, 8)]:
        E(cx + dx, hy + int(head_r * dy), r, r, (200, 242, 255, 180))

    return img.resize((w, h), Image.LANCZOS)


def cover(name, palette, top, bottom, girl_frac=0.46):
    img = vgrad((W, H), top, bottom)
    g = glow((W, H), (int(W * 0.74), int(H * 0.40)), 430,
             '#1E4FA8' if palette == 'dark' else '#FFD9E8', base=top)
    img = Image.blend(img, g, 0.30)
    d = ImageDraw.Draw(img)

    gw = int(W * girl_frac)
    gh = int(gw * 1.22)
    girl = chibi((gw, gh), palette)
    img.paste(girl, (W - gw - 4, int(H * 0.23)), girl)

    ink = '#FFFFFF' if palette == 'dark' else '#241B2F'
    sub = '#9FBDE6' if palette == 'dark' else '#7C7089'
    acc = '#6EE7FF' if palette == 'dark' else '#FF5C8A'

    d.text((70, 110), 'AI COMPANION · 本地部署' if palette == 'dark' else 'AI 伴侣 · 本地部署', font=f(24), fill=acc)
    d.text((70, 168), '养一只', font=f(80), fill=ink)
    d.text((70, 264), '鲸鱼娘', font=f(80), fill=acc)
    d.text((70, 366), '住进你的电脑', font=f(52), fill=ink)
    d.text((70, 448), '会记得你说过的话，\n有自己的脾气，数据在你自己机器上。', font=f(27, False), fill=sub)

    d.rounded_rectangle([70, 588, 540, 792], radius=32,
                        fill='#141B2E' if palette == 'dark' else '#FFFFFF')
    d.text((108, 614), '装机咨询 · 文字', font=f(24, False), fill=sub)
    d.text((108, 650), '¥9.9', font=f(82), fill=acc)
    d.text((108, 744), '15 分钟 · 给结论', font=f(23, False), fill=sub)

    # 三个卖点 chips（补空白）
    cy = 856
    labels = [('记得住', '#6EE7FF'), ('有性格', '#FFB3C7'), ('数据本地', '#9DFFC4')]
    x = 70
    for label, col in labels:
        font_c = f(26)
        tw = d.textlength(label, font=font_c)
        d.rounded_rectangle([x, cy, x + tw + 44, cy + 62], radius=31, outline=col, width=2)
        d.text((x + 22, cy + 17), label, font=font_c, fill=col)
        x += tw + 44 + 16

    d.text((70, 1180), '已有成品，装上就能聊', font=f(34), fill=ink)
    d.text((70, 1236), '本地 / 云服务器都能跑', font=f(25, False), fill=sub)
    d.text((W // 2, H - 54), '拍下后约时间 · 全程文字 · 不满意可退', font=f(22, False), fill=sub, anchor='ma')
    img.save(os.path.join(OUT, name))


cover('封面D-二次元深色.png', 'dark', '#0A1230', '#0B0F1A', 0.50)
cover('封面E-二次元浅色.png', 'light', '#FFF7FB', '#E9F1FF', 0.50)
print('chibi 封面完成')
