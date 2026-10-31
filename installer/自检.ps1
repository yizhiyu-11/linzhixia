# ============================================================
#  安装后自检：四项状态一眼看清
#    ① 程序在运行   ② QQ 已连接   ③ 白名单有号   ④ 模型 Key 已填
#  用法：双击「自检.cmd」，或 powershell -File 自检.ps1
# ============================================================
param([switch]$AutoClose)

$ErrorActionPreference = 'Continue'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$App = Join-Path $Root 'app'
$EnvFile = Join-Path $App '.env'

function Read-Env {
    $out = @{}
    if (Test-Path $EnvFile) {
        foreach ($line in Get-Content $EnvFile -Encoding UTF8) {
            $m = $line -match '^([A-Z0-9_]+)=(.*)$'
            if ($m) { $out[$Matches[1]] = $Matches[2].Trim() }
        }
    }
    return $out
}

function Get-Port($env) {
    if ($env.WEB_PORT -match '^\d+$') { return [int]$env.WEB_PORT }
    return 3870
}

function Get-Token {
    $tf = Join-Path $App 'data\web-token'
    if (Test-Path $tf) { return (Get-Content $tf -Raw).Trim() }
    return ''
}

# ---------- 检查 ----------
function Test-All {
    $env = Read-Env
    $port = Get-Port $env
    $token = Get-Token
    $r = [ordered]@{
        app = @{ ok = $false; text = '没在运行'; detail = '' }
        qq = @{ ok = $false; text = '未连接'; detail = '' }
        allow = @{ ok = $false; text = '没配白名单'; detail = '' }
        key = @{ ok = $false; text = '没填 API Key'; detail = '' }
        port = $port
        token = $token
    }

    # ① 程序
    try {
        $resp = Invoke-RestMethod "http://127.0.0.1:$port/api/state?token=$token" -TimeoutSec 6
        $r.app.ok = $true
        $r.app.text = "运行中（端口 $port）"
        $rt = $resp.runtime
        if ($rt) {
            $r.app.detail = "已运行 $([math]::Round($rt.uptimeSec / 60)) 分钟 · 今天收发 $($rt.messagesIn)/$($rt.messagesOut) 条"
            # ② QQ
            if ($rt.devNoQq) {
                $r.qq.ok = $false
                $r.qq.text = '本地模式（不接 QQ）'
                $r.qq.detail = '这是正常的，可以用浏览器聊；想接 QQ 就点下面「修复 QQ 连接」'
            } elseif ($rt.online) {
                $r.qq.ok = $true
                $r.qq.text = '已连接'
                $r.qq.detail = "机器人号：$($rt.qq)"
            } else {
                $r.qq.ok = $false
                $r.qq.text = '未连接'
                $r.qq.detail = '中间件没启动，或端口/token 不对'
            }
        }
    } catch {
        $r.app.ok = $false
        $r.app.text = '没在运行'
        $r.app.detail = '见下方按钮：启动程序'
    }

    # ③ 白名单
    $qqs = $env.ALLOWED_QQS
    if ($qqs) {
        $list = ($qqs -split ',') | ForEach-Object { $_.Trim() } | Where-Object { $_ }
        if ($list.Count -gt 0) {
            $r.allow.ok = $true
            $r.allow.text = "$($list.Count) 个号"
            $r.allow.detail = ($list -join '、')
        }
    } else {
        $r.allow.detail = '空 = 谁都不回。到「管理后台 → 访问权限」填你的 QQ'
    }

    # ④ 模型 Key
    $k = $env.DEEPSEEK_API_KEY
    if ($k -and $k.Length -gt 10) {
        $r.key.ok = $true
        $r.key.text = "已填（$($k.Substring(0, 5))…）"
        $r.key.detail = '模型：' + $(if ($env.DEEPSEEK_MODEL) { $env.DEEPSEEK_MODEL } else { 'deepseek-chat' })
    } else {
        $r.key.detail = '到「管理后台 → 模型」填 sk- 开头的 Key'
    }

    return $r
}

# ---------- 界面 ----------
$form = New-Object System.Windows.Forms.Form
$form.Text = '林知夏 · 使用前自检'
$form.Size = New-Object System.Drawing.Size(680, 520)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.BackColor = [System.Drawing.Color]::FromArgb(248, 249, 252)
$form.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 9)

$title = New-Object System.Windows.Forms.Label
$title.SetBounds(24, 18, 620, 30)
$title.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 14, [System.Drawing.FontStyle]::Bold)
$title.Text = '四项检查'
$form.Controls.Add($title)

$sub = New-Object System.Windows.Forms.Label
$sub.SetBounds(26, 50, 620, 22)
$sub.ForeColor = [System.Drawing.Color]::FromArgb(107, 114, 128)
$sub.Text = '全绿就说明能用了。哪项红了，按提示点下面的按钮。'
$form.Controls.Add($sub)

$listBox = New-Object System.Windows.Forms.Panel
$listBox.SetBounds(22, 80, 636, 300)
$listBox.BackColor = [System.Drawing.Color]::White
$form.Controls.Add($listBox)

$script:rows = @()

function Render($result) {
    $script:rows = @()
    $listBox.Controls.Clear()
    $items = @(
        @{ key = 'app'; name = '① 程序在运行'; r = $result.app },
        @{ key = 'qq'; name = '② QQ 已连接'; r = $result.qq },
        @{ key = 'allow'; name = '③ 白名单'; r = $result.allow },
        @{ key = 'key'; name = '④ 模型 Key'; r = $result.key }
    )
    $y = 8
    foreach ($it in $items) {
        $icon = if ($it.r.ok) { [char]0x2714 } else { [char]0x2716 }
        $color = if ($it.r.ok) { [System.Drawing.Color]::FromArgb(34, 160, 85) } else { [System.Drawing.Color]::FromArgb(210, 60, 50) }
        $dot = New-Object System.Windows.Forms.Label
        $dot.SetBounds(14, $y + 2, 26, 22)
        $dot.Text = [string]$icon
        $dot.Font = New-Object System.Drawing.Font('Segoe UI Symbol', 12, [System.Drawing.FontStyle]::Bold)
        $dot.ForeColor = $color
        $listBox.Controls.Add($dot)

        $nm = New-Object System.Windows.Forms.Label
        $nm.SetBounds(44, $y, 150, 22)
        $nm.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 10, [System.Drawing.FontStyle]::Bold)
        $nm.Text = $it.name
        $listBox.Controls.Add($nm)

        $st = New-Object System.Windows.Forms.Label
        $st.SetBounds(196, $y, 200, 22)
        $st.ForeColor = $color
        $st.Text = $it.r.text
        $listBox.Controls.Add($st)

        $dt = New-Object System.Windows.Forms.Label
        $dt.SetBounds(44, $y + 22, 570, 34)
        $dt.ForeColor = [System.Drawing.Color]::FromArgb(120, 126, 138)
        $dt.Text = $it.r.detail
        $listBox.Controls.Add($dt)

        $y += 68
        $script:rows += $it
    }
}

$btnRefresh = New-Object System.Windows.Forms.Button
$btnRefresh.SetBounds(22, 396, 110, 34)
$btnRefresh.Text = '重新检查'
$form.Controls.Add($btnRefresh)

$btnStart = New-Object System.Windows.Forms.Button
$btnStart.SetBounds(140, 396, 110, 34)
$btnStart.Text = '启动程序'
$form.Controls.Add($btnStart)

$btnFix = New-Object System.Windows.Forms.Button
$btnFix.SetBounds(258, 396, 130, 34)
$btnFix.Text = '修复 QQ 连接'
$form.Controls.Add($btnFix)

$btnAdmin = New-Object System.Windows.Forms.Button
$btnAdmin.SetBounds(396, 396, 120, 34)
$btnAdmin.Text = '打开管理后台'
$form.Controls.Add($btnAdmin)

$btnChat = New-Object System.Windows.Forms.Button
$btnChat.SetBounds(524, 396, 120, 34)
$btnChat.Text = '打开聊天'
$btnChat.BackColor = [System.Drawing.Color]::FromArgb(59, 110, 246)
$btnChat.ForeColor = [System.Drawing.Color]::White
$btnChat.FlatStyle = 'Flat'
$form.Controls.Add($btnChat)

$hint = New-Object System.Windows.Forms.Label
$hint.SetBounds(24, 440, 620, 30)
$hint.ForeColor = [System.Drawing.Color]::FromArgb(107, 114, 128)
$hint.Text = ''
$form.Controls.Add($hint)

function Refresh-Check {
    $hint.Text = '检查中…'
    $form.Refresh()
    $r = Test-All
    Render $r
    $bad = @($r.app, $r.qq, $r.allow, $r.key | Where-Object { -not $_.ok })
    $hint.Text = if ($bad.Count -eq 0) { '全部通过，可以开始用了。' } else { "还有 $($bad.Count) 项没过，按上面的提示处理。" }
    return $r
}

$btnRefresh.Add_Click({ Refresh-Check | Out-Null })

$btnStart.Add_Click({
    Start-Process -FilePath (Join-Path $Root '启动.cmd') -WorkingDirectory $Root -WindowStyle Hidden
    Start-Sleep -Seconds 6
    Refresh-Check | Out-Null
})

$btnFix.Add_Click({
    $rp = Join-Path $Root 'repair.ps1'
    if (Test-Path $rp) {
        Start-Process -FilePath 'powershell' -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File "' + $rp + '"')
    } else {
        [System.Windows.Forms.MessageBox]::Show('缺少 repair.ps1，安装包不完整', '提示')
    }
})

$btnAdmin.Add_Click({
    $r = Test-All
    Start-Process "http://127.0.0.1:$($r.port)/?token=$($r.token)"
})

$btnChat.Add_Click({
    $r = Test-All
    if ($r.app.ok) {
        Start-Process "http://127.0.0.1:$($r.port)/?token=$($r.token)&module=__sandbox"
    } else {
        [System.Windows.Forms.MessageBox]::Show('程序还没启动，先点「启动程序」', '提示')
    }
})

$form.Add_Shown({
    Refresh-Check | Out-Null
    if ($AutoClose) {
        $t = New-Object System.Windows.Forms.Timer
        $t.Interval = 8000
        $t.Add_Tick({ $form.Close() })
        $t.Start()
    }
})

[void]$form.ShowDialog()
