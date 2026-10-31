# -*- coding: utf-8 -*-
"""闲鱼商品图 v2 · 内容页：02 能判断什么 / 03 服务与价格 / 04 怎么进行 / 05 真实实例 / 06 成品交付。"""
import os
from PIL import Image, ImageDraw, ImageFont

OUT = r'E:\ai-gf\docs\商业\闲鱼图片'
SHOT = r'E:\ai-gf\docs\商业\截图'
os.makedirs(OUT, exist_ok=True)

W, H = 1080, 1440
INK = '#1F2430'
GRAY = '#6B7280'
LIGHT = '#F5F6F9'
ACCENT = '#3B6EF6'
SOFT = '#E8EFFE'
PINK = '#FF5C8A'
GREEN = '#12A150'
RED = '#D93F3F'

FONT_BD = r'C:\Windows\Fonts\msyhbd.ttc'
FONT_RG = r'C:\Windows\Fonts\msyh.ttc'


def f(size, bold=True):
    return ImageFont.truetype(FONT_BD if bold else FONT_RG, size)


def canvas(bg='#FFFFFF'):
    img = Image.new('RGB', (W, H), bg)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 10], fill=ACCENT)
    return img, d


def text(d, xy, s, size, color=INK, bold=True, spacing=14):
    font = f(size, bold)
    y = xy[1]
    for line in s.split('\n'):
        d.text((xy[0], y), line, font=font, fill=color)
        y += size + spacing
    return y


def footer(d, s):
    d.text((W // 2, H - 66), s, font=f(24, False), fill='#9AA3AF', anchor='ma')


def paste_rounded(base, img, xy, radius=24):
    img = img.convert('RGB')
    mask = Image.new('L', img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.size[0], img.size[1]], radius=radius, fill=255)
    base.paste(img, xy, mask)


# ---------- 02 能判断什么 ----------
def page02():
    img, d = canvas()
    d.text((80, 84), '这 15–30 分钟，', font=f(54), fill=INK)
    d.text((80, 152), '帮你把话说清楚', font=f(54), fill=ACCENT)

    items = [
        ('你的机器能不能跑', '系统版本、内存、显卡，够不够'),
        ('大概要花多少钱', '模型调用、服务器，一次性 + 每月'),
        ('本地装还是云上装', '各自优缺点，你该选哪个'),
        ('性格怎么调才不像客服', '改哪几个维度，效果差多少'),
        ('哪些坑要提前避', '账号、隐私、内容边界'),
    ]
    y = 268
    for i, (h, sub) in enumerate(items, 1):
        d.ellipse([80, y + 8, 122, y + 50], fill=SOFT)
        d.text((101, y + 29), str(i), font=f(26), fill=ACCENT, anchor='mm')
        d.text((148, y), h, font=f(38), fill=INK)
        d.text((148, y + 56), sub, font=f(27, False), fill=GRAY)
        y += 132

    d.rounded_rectangle([80, y + 40, W - 80, y + 250], radius=28, fill='#FFF5F7')
    text(d, (120, y + 66), '一律不接', 30, RED, spacing=10)
    text(d, (120, y + 116), '· 涉黄、涉政、侵权内容\n· 克隆真人声音/形象（无授权）\n· 要求"保证不封号"', 27, '#8A5560', bold=False, spacing=10)

    footer(d, '先判断清楚，再决定要不要花钱')
    img.save(os.path.join(OUT, '02-能判断什么.png'))


# ---------- 03 服务与价格 ----------
def page03():
    img, d = canvas()
    d.text((80, 78), '服务与价格', font=f(54), fill=INK)
    d.text((80, 148), '咨询先做，其余可先聊再约', font=f(28, False), fill=GRAY)

    tiers = [
        ('咨询 · 快速', '9.9', '15 分钟文字 · 5 条结论', ACCENT, True),
        ('咨询 · 标准', '19.9', '30 分钟文字 · 清单 · 3 天追问', ACCENT, True),
        ('成品版 · 本地', '99', '装上就能用 · 含人设/后台/备份 · 7 天答疑', '#7C8AA5', True),
        ('成品版 · 云', '199', '云服务器部署 · 24h 在线（服务器费自理）', '#7C8AA5', False),
        ('定制版', '299', '成品版 + 定制人设 + 30 条调优', '#7C8AA5', False),
        ('年度陪跑', '699', '定制版 + 12 个月维护更新 + 优先响应', PINK, False),
    ]
    y = 220
    for name, price, desc, color, ready in tiers:
        bh = 152
        d.rounded_rectangle([80, y, W - 80, y + bh], radius=26,
                            fill='#FFFFFF' if ready else '#FAFBFC', outline='#E7E9EF', width=2)
        d.text((118, y + 26), name, font=f(32), fill=INK)
        d.text((118, y + 74), desc, font=f(23, False), fill=GRAY)
        d.text((W - 118, y + 30), '¥', font=f(24), fill=color, anchor='ra')
        d.text((W - 118, y + 56), price, font=f(56), fill=color, anchor='ra')
        if ready:
            d.rounded_rectangle([118, y + 108, 196, y + 142], radius=17, fill=SOFT)
            d.text((157, y + 125), '可拍', font=f(20), fill=ACCENT, anchor='mm')
        y += 172

    d.text((80, y + 16), '为什么这么定：咨询是判断，成品是交付，\n定制是改到像你要的那个人。', font=f(27, False), fill=GRAY)
    footer(d, '价格随内容调整 · 老客户有优惠')
    img.save(os.path.join(OUT, '03-服务与价格.png'))


# ---------- 04 怎么进行 ----------
def page04():
    img, d = canvas()
    d.text((80, 80), '怎么进行', font=f(54), fill=INK)
    d.text((80, 148), '全程文字沟通，不用语音', font=f(28, False), fill=PINK)

    steps = [
        ('拍下并留言', '电脑系统、内存、想要什么样的角色'),
        ('约时间', '48 小时内，晚上优先，文字聊'),
        ('聊 15–30 分钟', '一问一答，边聊边判断'),
        ('给结论清单', '能不能装、预算区间、推荐路线'),
    ]
    y = 230
    for i, (h, sub) in enumerate(steps, 1):
        d.rounded_rectangle([80, y, W - 80, y + 168], radius=26, fill=LIGHT)
        d.text((118, y + 36), f'0{i}', font=f(44), fill=ACCENT)
        d.text((238, y + 32), h, font=f(36), fill=INK)
        d.text((238, y + 94), sub, font=f(26, False), fill=GRAY)
        y += 192

    d.line([80, y + 12, W - 80, y + 12], fill='#E5E7EB', width=2)
    text(d, (80, y + 50), '先说清楚', 32, RED, spacing=10)
    warns = [
        '不承诺账号安全：第三方平台的风险由你判断',
        '模型与服务器费用自理，本服务不含额度',
        '不接涉黄、涉政、侵犯肖像或声音的需求',
    ]
    wy = y + 106
    for w in warns:
        d.text((80, wy), '· ' + w, font=f(26, False), fill=GRAY)
        wy += 46

    footer(d, '看完还有疑问，拍咨询再细聊')
    img.save(os.path.join(OUT, '04-怎么进行.png'))


# ---------- 05 真实实例 ----------
def page05():
    img, d = canvas('#0B0F1A')
    d.text((80, 76), '这是真的跑起来的', font=f(52), fill='#FFFFFF')
    d.text((80, 144), '不是效果图，是我自己那套的截图', font=f(26, False), fill='#8FA0BD')

    shot = Image.open(os.path.join(SHOT, 'demo-sandbox.png'))
    target_w = 920
    target_h = int(shot.size[1] * target_w / shot.size[0])
    shot = shot.resize((target_w, target_h), Image.LANCZOS)
    paste_rounded(img, shot, (80, 220), radius=22)
    d.rectangle([80, 220, 1000, 220], fill='#0B0F1A')

    y = 220 + target_h + 46
    notes = [
        ('记得住', '你说过不喜欢下雨，她下次会提'),
        ('看得见', '右侧能看到她这轮为什么这么回'),
        ('装得上', '本地 / 云服务器都能跑，成品可交付'),
    ]
    for k, v in notes:
        d.text((80, y), k, font=f(30), fill='#6EE7FF')
        d.text((250, y + 4), v, font=f(28, False), fill='#A8B3C7')
        y += 66

    d.rounded_rectangle([80, 1180, W - 80, 1320], radius=28, fill='#141B2E', outline='#24304A', width=2)
    d.text((120, 1214), '想先知道自己那台机器行不行？', font=f(34), fill='#FFFFFF')
    d.text((120, 1264), '拍个咨询，15 分钟给你结论，不用先花钱买设备。', font=f(26, False), fill='#8FA0BD')
    d.text((W // 2, H - 56), '截图来自测试台，独立数据库，不涉及真实聊天记录', font=f(22, False), fill='#5D6B85', anchor='ma')
    img.save(os.path.join(OUT, '05-真实实例.png'))


# ---------- 06 成品版交付什么 ----------
def page06():
    img, d = canvas()
    d.text((80, 84), '成品版给你什么', font=f(54), fill=INK)
    d.text((80, 152), '装上就能聊，不用你自己拼', font=f(28, False), fill=GRAY)

    cards = [
        ('一个能跑的程序', '双击启动，后台可看状态'),
        ('一套现成人设', '会记住事、有自己的语气，可换'),
        ('一个管理后台', '改参数、看对话、查用量'),
        ('一份备份方案', '数据丢了能找回'),
        ('一页纸说明书', '怎么启动、停止、改人设'),
        ('7 天文字答疑', '装完不会用可以问'),
    ]
    y = 236
    for i, (h, sub) in enumerate(cards):
        col = i % 2
        row = i // 2
        x = 80 + col * 470
        yy = y + row * 210
        d.rounded_rectangle([x, yy, x + 440, yy + 186], radius=24, fill=LIGHT)
        d.text((x + 28, yy + 26), h, font=f(30), fill=INK)
        d.text((x + 28, yy + 76), sub, font=f(23, False), fill=GRAY)
        d.text((x + 28, yy + 128), '0' + str(i + 1), font=f(24), fill=ACCENT)

    d.rounded_rectangle([80, y + 3 * 210 + 20, W - 80, y + 3 * 210 + 150], radius=24, fill='#FFF5F7')
    d.text((116, y + 3 * 210 + 46), '不含：代运营、代持账号、保证不封号', font=f(26), fill='#B24A6A')

    footer(d, '本地版 / 云服务器版可选，配置不同价格不同')
    img.save(os.path.join(OUT, '06-成品交付.png'))


page02()
page03()
page04()
page05()
page06()
print('内容页 5 张完成')
