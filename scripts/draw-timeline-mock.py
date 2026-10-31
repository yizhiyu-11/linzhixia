# -*- coding: utf-8 -*-
"""时间线界面草图（预览用，不放进 docs）"""
import math
import os

from PIL import Image, ImageDraw, ImageFont

W, H = 1500, 860
FB = r'C:\Windows\Fonts\msyhbd.ttc'
FR = r'C:\Windows\Fonts\msyh.ttc'
f = lambda s: ImageFont.truetype(FR, s)
fb = lambda s: ImageFont.truetype(FB, s)

INK = (28, 36, 50)
GREY = (120, 134, 152)
LINE = (230, 238, 246)
BG = (250, 252, 255)
BLUE = (43, 110, 200)
RED = (226, 90, 106)
GREEN = (46, 156, 116)
PURPLE = (150, 106, 200)

img = Image.new('RGB', (W, H), BG)
d = ImageDraw.Draw(img)

# 画布区域
L, R = 120, W - 60
TOP = 150
DAY_W = R - L
HOURS = 24


def px(h):
    return L + DAY_W * (h / HOURS)


d.text((60, 34), '时间线 · 她的一天', font=fb(34), fill=INK)
d.text((60, 82), '2026年10月30日 · 星期五', font=f(18), fill=GREY)
# 切换按钮
for i, (t, on) in enumerate((('今天', True), ('昨天', False), ('选日期', False))):
    x = W - 420 + i * 96
    d.rounded_rectangle([x, 40, x + 84, 76], radius=10, fill=(255, 255, 255) if not on else (43, 110, 200),
                        outline=LINE if not on else None, width=2)
    d.text((x + 20, 48), t, font=f(17), fill=INK if not on else (255, 255, 255))

# 时段背景
bands = [('早间', 7.2, 9), ('上午', 9, 12), ('午间', 12, 13), ('下午', 13, 18), ('晚间', 18, 21.5), ('夜间', 21.5, 24)]
band_colors = [(255, 246, 230), (238, 244, 252), (255, 244, 236), (236, 244, 252), (250, 240, 246), (238, 240, 250)]
d.text((60, TOP - 26), '时段', font=f(16), fill=GREY)
for (name, a, b), c in zip(bands, band_colors):
    d.rectangle([px(a), TOP, px(b), TOP + 34], fill=c)
    d.text((px(a) + 10, TOP + 7), name, font=f(15), fill=GREY)

# 时间刻度
AXIS = TOP + 34
for h in range(0, 25, 2):
    x = px(h)
    d.line([(x, AXIS), (x, H - 90)], fill=LINE, width=1)
    if h < 24:
        d.text((x - 8, H - 78), f'{h}:00', font=f(14), fill=GREY)

# 场景条带
SCENE_Y = AXIS + 16
scenes = [
    (7.4, 8.2, '家 · 刚起床', (255, 244, 226), (168, 120, 40)),
    (8.2, 9.0, '地铁 · 通勤', (232, 240, 250), (70, 96, 140)),
    (9.0, 12.0, '公司 · 改稿', (226, 234, 248), (48, 74, 140)),
    (12.0, 13.0, '公司 · 等外卖', (255, 240, 232), (170, 100, 60)),
    (13.0, 17.6, '公司 · 开会', (226, 234, 248), (48, 74, 140)),
    (17.6, 18.6, '路上 · 走回家', (232, 246, 238), (46, 130, 96)),
    (18.6, 20.2, '家 · 煮面', (255, 244, 226), (168, 120, 40)),
    (20.2, 22.0, '家 · 沙发刷手机', (244, 238, 250), (120, 88, 176)),
    (22.0, 23.8, '床上 · 睡不着', (238, 236, 250), (100, 80, 170)),
]
d.text((60, SCENE_Y + 8), '她在', font=f(16), fill=GREY)
for a, b, label, fill, ink in scenes:
    d.rounded_rectangle([px(a) + 1, SCENE_Y, px(b) - 1, SCENE_Y + 40], radius=8, fill=fill)
    d.text((px(a) + 8, SCENE_Y + 10), label, font=f(15), fill=ink)

# 她的情绪曲线
EMO_Y, EMO_H = SCENE_Y + 66, 110
d.text((60, EMO_Y + 40), '她的情绪', font=f(16), fill=GREY)
d.line([(L, EMO_Y + EMO_H // 2), (R, EMO_Y + EMO_H // 2)], fill=(220, 230, 240), width=1)


def v_at(h):
    # 造一条像样的曲线：早上低、被说之后掉下去、午饭后回升、晚上高
    pts = [(7.4, 0.0), (8.5, 0.1), (10.6, -0.62), (12.2, -0.35), (13.5, -0.2), (15.5, 0.25),
           (18.0, 0.05), (19.5, 0.45), (21.0, 0.3), (23.0, 0.12)]
    for i in range(len(pts) - 1):
        x0, y0 = pts[i]
        x1, y1 = pts[i + 1]
        if x0 <= h <= x1:
            t = (h - x0) / (x1 - x0)
            return y0 + (y1 - y0) * t
    return 0.0


prev = None
for i in range(0, 24 * 6):
    h = i / 6
    v = v_at(h)
    y = EMO_Y + EMO_H // 2 - v * (EMO_H / 2)
    cur = (px(h), y)
    if prev:
        d.line([prev, cur], fill=GREEN if v >= 0 else RED, width=3)
    prev = cur

# 零轴线以下的填充
# 他的情绪
HE_Y = EMO_Y + EMO_H + 40
d.text((60, HE_Y + 26), '他的情绪', font=f(16), fill=GREY)
d.line([(L, HE_Y + 40), (R, HE_Y + 40)], fill=(220, 230, 240), width=1)
he_pts = [(10.6, -0.5), (11.2, -0.45), (12.0, -0.2), (15.0, 0.1), (19.3, 0.3), (21.0, 0.05), (23.5, -0.15)]
prev = None
for h, v in he_pts:
    y = HE_Y + 40 - v * 34
    cur = (px(h), y)
    if prev:
        d.line([prev, cur], fill=PURPLE, width=3)
        d.ellipse([cur[0] - 4, cur[1] - 4, cur[0] + 4, cur[1] + 4], fill=PURPLE)
    prev = cur

# 事件层
EV_Y = HE_Y + 96
d.text((60, EV_Y - 6), '发生了什么', font=f(16), fill=GREY)
d.line([(L, EV_Y + 16), (R, EV_Y + 16)], fill=(232, 240, 248), width=2)
events = [
    (8.3, 'user'), (10.6, 'mood'), (10.62, 'user'), (12.1, 'user'), (12.15, 'her'),
    (15.4, 'mood'), (19.0, 'proactive'), (19.3, 'user'), (21.5, 'user'), (23.6, 'proactive'),
]
for h, kind in events:
    x = px(h)
    if kind == 'user':
        d.ellipse([x - 6, EV_Y + 10, x + 6, EV_Y + 22], fill=BLUE)
    elif kind == 'her':
        d.ellipse([x - 6, EV_Y + 10, x + 6, EV_Y + 22], fill=(255, 255, 255), outline=BLUE, width=2)
    elif kind == 'proactive':
        d.polygon([(x, EV_Y + 6), (x - 7, EV_Y + 24), (x + 7, EV_Y + 24)], fill=(240, 158, 88))
    else:
        d.polygon([(x, EV_Y + 4), (x + 5, EV_Y + 13), (x + 12, EV_Y + 14), (x + 6, EV_Y + 20), (x + 8, EV_Y + 27),
                   (x, EV_Y + 23), (x - 8, EV_Y + 27), (x - 6, EV_Y + 20), (x - 12, EV_Y + 14), (x - 5, EV_Y + 13)],
                  fill=RED)

# 花费柱
COST_Y = EV_Y + 70
d.text((60, COST_Y + 8), '花费', font=f(16), fill=GREY)
costs = [0.02, 0.01, 0.05, 0.03, 0.07, 0.02, 0.01, 0.04, 0.06, 0.03, 0.02, 0.05, 0.04, 0.06, 0.03, 0.02, 0.01, 0.03, 0.05, 0.02, 0.01, 0.02, 0.01, 0.01]
mx = max(costs)
bw = DAY_W / 24 * 0.55
for i, c in enumerate(costs):
    x = px(i) + (DAY_W / 24 - bw) / 2
    hgt = c / mx * 34
    d.rounded_rectangle([x, COST_Y + 46 - hgt, x + bw, COST_Y + 46], radius=3, fill=(208, 218, 232))
d.text((R - 150, COST_Y + 4), '今日 ¥0.86', font=fb(16), fill=INK)

# 图例
ly = H - 46
lx = L
for name, c in (('对话', BLUE), ('主动消息', (240, 158, 88)), ('情绪事件', RED), ('他的情绪', PURPLE)):
    d.ellipse([lx, ly, lx + 10, ly + 10], fill=c)
    d.text((lx + 16, ly - 4), name, font=f(15), fill=INK)
    lx += 130

os.makedirs('_tmp', exist_ok=True)
img.save('_tmp/时间线草图.png')
print('saved _tmp/时间线草图.png')
