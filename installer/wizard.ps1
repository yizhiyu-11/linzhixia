# ============================================================
#  林知夏 · 本地版 图形安装向导（A1）
#  五步：欢迎 → API Key → QQ 连接 → 安装 → 完成
#  只检测、不修改客户的 QQ 与第三方工具
# ============================================================
param(
    [switch]$NoStart,
    [switch]$AutoClose,
    [switch]$SelfTest,
    [int]$StartStep = 0,
    [string]$PreKey = '',
    [string]$PreQq = ''
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$script:Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$App = Join-Path $Root 'app'
$Node = Join-Path $Root 'runtime\node.exe'
$EnvFile = Join-Path $App '.env'

# ---------- 兼容性知识（我们实测过的组合）----------
$KNOWN = @(
    @{ qq = '9.9.2'; note = 'QQ 9.9.22 ~ 9.9.23 配 NapCat 4.18.x 可用（我们的早期组合）' },
    @{ qq = '9.9.3'; note = 'QQ 9.9.36 配 NapCat 4.18.41 注入失败；SnowLuma 2.2.0 可用（我们现在的组合）' }
)

function Get-QqInfo {
    $out = @{ installed = $false; version = ''; path = '' }
    foreach ($k in @('HKLM:\SOFTWARE\WOW6432Node\Tencent\QQNT', 'HKCU:\Software\Tencent\QQNT')) {
        try {
            $v = (Get-ItemProperty $k -ErrorAction SilentlyContinue).version
            if ($v) { $out.version = [string]$v; $out.installed = $true }
            $inst = (Get-ItemProperty $k -ErrorAction SilentlyContinue).Install
            if ($inst -and (Test-Path $inst)) { $out.path = $inst }
        } catch { }
    }
    foreach ($p in @('C:\Program Files\Tencent\QQNT\QQ.exe', 'C:\Program Files (x86)\Tencent\QQNT\QQ.exe')) {
        if (Test-Path $p) {
            $out.installed = $true
            $out.path = Split-Path $p -Parent
            try { $out.version = (Get-Item $p).VersionInfo.FileVersion } catch { }
            break
        }
    }
    return $out
}

function Get-OneBotInfo {
    $out = @{ port3001 = $false; tools = @(); endpoints = @() }
    foreach ($p in @(3001, 3000, 5099)) {
        if (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue) {
            $out.endpoints += $p
            if ($p -eq 3001) { $out.port3001 = $true }
        }
    }
    foreach ($n in @('NapCatWinBootMain', 'napcat', 'SnowLuma', 'qsign')) {
        if (Get-Process -Name $n -ErrorAction SilentlyContinue) { $out.tools += $n }
    }
    $dirs = @()
    if ($env:NAPCAT_DIR) { $dirs += $env:NAPCAT_DIR }
    foreach ($drive in @('C:', 'D:', 'E:', 'F:')) {
        foreach ($name in @('napcat', 'snowluma', 'NapCat')) {
            $dirs += ($drive + '\' + $name)
        }
    }
    $dirs += (Join-Path $env:USERPROFILE 'napcat')
    $dirs += (Join-Path $env:USERPROFILE 'snowluma')
    foreach ($d in ($dirs | Select-Object -Unique)) {
        if (Test-Path $d) { $out.tools += ('目录:' + $d) }
    }
    return $out
}

function Get-ConnVerdict {
    $hasTool = ($onebot.tools.Count -gt 0)
    if ($onebot.port3001) { return '正常：3001 已在监听，OneBot 服务是通的。' }
    if ($hasTool) {
        if ($qqInfo.version -match '^9\.9\.(3[0-9])') {
            return '发现工具目录，但 3001 没监听 —— 你的 QQ 是 9.9.3x，NapCat 4.18.x 注入会失败。建议改用 SnowLuma 这类新版工具。'
        }
        return '发现工具目录，但 3001 没监听 —— 多半是注入失败或没登录（先看工具窗口的报错）。'
    }
    return '没发现 OneBot 工具 —— 需要先装一个（见说明书第二节）；不装也能用浏览器聊。'
}

function Get-QqAutoUpdateHint($ver) {
    if (-not $ver) { return '没检测到 QQ，装完后可自行安装。' }
    if ($ver -match '^9\.9\.(2[0-9])') { return '当前版本属于我们验证过的旧组合，建议保持这个版本，关掉自动更新。' }
    if ($ver -match '^9\.9\.3') { return '当前是较新的 9.9.3x，NapCat 4.18.x 注入会失败，建议用 SnowLuma 这类新版工具。' }
    return '没在实测清单里，可能可用也可能不行；建议先测连接再决定。'
}

# ---------- 自检模式（不开窗口，只打印环境）----------
if ($SelfTest) {
    $qqInfo = Get-QqInfo
    $onebot = Get-OneBotInfo
    $port = 0
    foreach ($p in 3870..3885) {
        if (-not (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue)) { $port = $p; break }
    }
    Write-Host '=== QQ ==='
    Write-Host ("  已安装: " + $qqInfo.installed)
    Write-Host ("  版本:   " + $qqInfo.version)
    Write-Host ("  路径:   " + $qqInfo.path)
    Write-Host ("  兼容提示: " + (Get-QqAutoUpdateHint $qqInfo.version))
    Write-Host '=== OneBot / 第三方工具 ==='
    Write-Host ("  3001 监听: " + $onebot.port3001)
    Write-Host ("  监听端口: " + (($onebot.endpoints | ForEach-Object { $_ }) -join ', '))
    Write-Host ("  发现工具: " + (($onebot.tools | Select-Object -Unique) -join ', '))
    Write-Host ("  管理后台端口: " + $port)
    exit 0
}

# ---------- 界面 ----------
$form = New-Object System.Windows.Forms.Form
$form.Text = '林知夏 AI 角色对话系统 · 安装'
$form.Size = New-Object System.Drawing.Size(736, 636)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.BackColor = [System.Drawing.Color]::FromArgb(248, 249, 252)
$form.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 9)

$title = New-Object System.Windows.Forms.Label
$title.SetBounds(28, 22, 660, 34)
$title.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 15, [System.Drawing.FontStyle]::Bold)
$title.ForeColor = [System.Drawing.Color]::FromArgb(31, 36, 48)
$title.Text = '林知夏 AI 角色对话系统'
$form.Controls.Add($title)

$subtitle = New-Object System.Windows.Forms.Label
$subtitle.SetBounds(30, 58, 660, 24)
$subtitle.ForeColor = [System.Drawing.Color]::FromArgb(107, 114, 128)
$subtitle.Text = '本地版 v1.0 · 安装向导'
$form.Controls.Add($subtitle)

$stepLabel = New-Object System.Windows.Forms.Label
$stepLabel.SetBounds(30, 86, 660, 22)
$stepLabel.ForeColor = [System.Drawing.Color]::FromArgb(59, 110, 246)
$stepLabel.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 10, [System.Drawing.FontStyle]::Bold)
$form.Controls.Add($stepLabel)

$panel = New-Object System.Windows.Forms.Panel
$panel.SetBounds(24, 114, 660, 380)
$panel.BackColor = [System.Drawing.Color]::White
$form.Controls.Add($panel)

$hint = New-Object System.Windows.Forms.Label
$hint.SetBounds(30, 504, 660, 40)
$hint.ForeColor = [System.Drawing.Color]::FromArgb(107, 114, 128)
$hint.Text = ''
$form.Controls.Add($hint)

$btnBack = New-Object System.Windows.Forms.Button
$btnBack.SetBounds(446, 552, 100, 34)
$btnBack.Text = '上一步'
$form.Controls.Add($btnBack)

$btnNext = New-Object System.Windows.Forms.Button
$btnNext.SetBounds(556, 552, 144, 34)
$btnNext.Text = '下一步'
$btnNext.BackColor = [System.Drawing.Color]::FromArgb(59, 110, 246)
$btnNext.ForeColor = [System.Drawing.Color]::White
$btnNext.FlatStyle = 'Flat'
$form.Controls.Add($btnNext)

function Clear-Panel {
    $panel.Controls.Clear()
}

function Add-Text($text, $y, $h = 60, $bold = $false) {
    $l = New-Object System.Windows.Forms.Label
    $l.SetBounds(16, $y, 620, $h)
    $l.Text = $text
    $l.ForeColor = [System.Drawing.Color]::FromArgb(31, 36, 48)
    if ($bold) { $l.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 10, [System.Drawing.FontStyle]::Bold) }
    $panel.Controls.Add($l)
    return $l
}

function Add-Input($y, $value = '') {
    $t = New-Object System.Windows.Forms.TextBox
    $t.SetBounds(16, $y, 620, 28)
    $t.Text = $value
    $panel.Controls.Add($t)
    return $t
}

# ---------- 状态 ----------
$state = @{ step = 0; apiKey = ''; url = 'ws://127.0.0.1:3001'; token = ''; qqs = ''; port = 0 }
$qqInfo = Get-QqInfo
$onebot = Get-OneBotInfo

function Find-Port {
    foreach ($p in 3870..3885) {
        if (-not (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue)) { return $p }
    }
    return 0
}
$state.port = Find-Port

# ---------- 各步骤渲染 ----------
function Show-Step {
    Clear-Panel
    switch ($state.step) {
        0 {
            $stepLabel.Text = '① 欢迎'
            Add-Text '这个程序装在你自己的电脑上，通过 QQ 和 AI 角色聊天。' 16 30 $true
            Add-Text "所有聊天记录存在本地，不上传第三方服务器。" 52 24
            Add-Text "安装会做四件事：写配置、建桌面图标、启动程序、检查 QQ 连接。" 84 24
            Add-Text "不会安装驱动、不改系统设置、不动你的 QQ 和第三方工具。" 112 24
            Add-Text "环境检查：" 152 24 $true
            $ver = if ($qqInfo.version) { $qqInfo.version } else { '未检测到' }
            Add-Text ("· QQ：" + $(if ($qqInfo.installed) { "已安装，版本 $ver（$($qqInfo.path)）" } else { '未检测到（可稍后安装）' })) 180 24
            $ob = if ($onebot.port3001) { '已检测到 OneBot 服务（3001 端口在监听）' } else { '未检测到 OneBot 服务（可选，不装也能用浏览器聊）' }
            Add-Text ("· QQ 连接中间件：" + $ob) 206 24
            Add-Text ("· 连接诊断：" + (Get-ConnVerdict)) 232 46
            Add-Text "· 内置运行环境：已打包，无需另外安装 Node.js" 282 24
            Add-Text ("· 管理后台端口：" + $state.port) 306 24
            $hint.Text = '点「下一步」开始。'
        }
        1 {
            $stepLabel.Text = '② 模型 API Key'
            Add-Text '需要一个大模型 API Key，程序靠它生成回复。' 16 26 $true
            Add-Text "没有的话可以跳过：装完在管理后台「模型」页填，或先用浏览器试聊。" 46 44
            Add-Text 'Key（形如 sk-xxxxxxxx）：' 100 22
            $script:tbKey = Add-Input 126 $state.apiKey
            $script:tbKey.Width = 620
            Add-Text '推荐 DeepSeek：platform.deepseek.com 注册 → 充值 → API Keys' 164 22
            Add-Text '费用参考：一轮对话约 0.005 元，每天聊 100 轮约 15 元/月。' 186 22
            $hint.Text = '可以留空，稍后在管理后台补。'
        }
        2 {
            $stepLabel.Text = '③ QQ 连接（可选）'
            Add-Text '想要在 QQ 里聊天，需要一个 OneBot 服务（例如 NapCat / SnowLuma）。' 14 26 $true
            Add-Text '本安装包不含这类工具，需要你自己安装并登录机器人 QQ。' 42 24
            Add-Text '这类工具属于第三方非官方实现，可能违反平台协议，账号风险由你自行判断。' 66 24

            $verLine = if ($qqInfo.version) { "检测到 QQ 版本：$($qqInfo.version)" } else { '未检测到 QQ' }
            Add-Text $verLine 100 22
            Add-Text (Get-QqAutoUpdateHint $qqInfo.version) 122 34
            Add-Text ('连接诊断：' + (Get-ConnVerdict)) 160 42

            Add-Text ('OneBot 地址（默认 ' + $state.url + '）：') 208 22
            $script:tbUrl = Add-Input 232 $state.url
            $script:tbUrl.Width = 420
            $script:tbUrl.Height = 26
            $script:tbUrl.Location = New-Object System.Drawing.Point(16, 232)

            Add-Text 'Token（没设置就留空）：' 268 22
            $script:tbToken = Add-Input 290 $state.token
            $script:tbToken.Width = 420

            Add-Text '谁可以和她聊天（QQ 号，多个用英文逗号）：' 326 22
            $script:tbQq = Add-Input 348 $state.qqs
            $script:tbQq.Width = 420

            $btnTest = New-Object System.Windows.Forms.Button
            $btnTest.SetBounds(450, 230, 110, 28)
            $btnTest.Text = '测试连接'
            $panel.Controls.Add($btnTest)
            $script:lblTest = Add-Text '' 380 30
            $btnTest.Add_Click({
                $script:lblTest.Text = '检测中…'
                [System.Windows.Forms.Application]::DoEvents()
                $r = Test-OneBotNow $script:tbUrl.Text.Trim() $script:tbToken.Text.Trim()
                $script:lblTest.Text = $r
            })
            $btnFix = New-Object System.Windows.Forms.Button
            $btnFix.SetBounds(450, 268, 110, 28)
            $btnFix.Text = '一键修复'
            $panel.Controls.Add($btnFix)
            $btnFix.Add_Click({
                if (-not (Test-Path (Join-Path $script:Root 'repair.ps1'))) {
                    $script:lblTest.Text = '缺少 repair.ps1'
                    return
                }
                $rp = Join-Path $script:Root 'repair.ps1'
                # 路径可能带空格/中文，必须整体加引号，否则 Start-Process 会拆错
                Start-Process -FilePath 'powershell' -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File "' + $rp + '"')
            })

            $hint.Text = '连不上就点「一键修复」：会检测版本、建议并下载匹配的工具（不碰你的 QQ）。'
        }
        3 {
            $stepLabel.Text = '④ 安装'
            $script:log = New-Object System.Windows.Forms.TextBox
            $script:log.SetBounds(16, 16, 620, 290)
            $script:log.Multiline = $true
            $script:log.ScrollBars = 'Vertical'
            $script:log.ReadOnly = $true
            $script:log.BackColor = [System.Drawing.Color]::FromArgb(15, 23, 42)
            $script:log.ForeColor = [System.Drawing.Color]::FromArgb(148, 233, 255)
            $script:log.Font = New-Object System.Drawing.Font('Consolas', 9)
            $panel.Controls.Add($script:log)
            $hint.Text = '正在写入配置并建快捷方式…'
            Do-Install
        }
        4 {
            $stepLabel.Text = '⑤ 完成'
            $ok = $script:installOk
            Add-Text ($(if ($ok) { '安装完成' } else { '安装未完成，请看下方提示' })) 16 30 $true
            $stateTxt = @()
            $stateTxt += '建议先看「林知夏 自检」：四项状态全绿才算装好。'
            $stateTxt += '现在可以：'
            $stateTxt += '  · 在 QQ 里给机器人号发消息（如果已连接）'
            $stateTxt += '  · 双击桌面「林知夏 管理后台」改人设和参数'
            $stateTxt += '  · 双击桌面「林知夏 测试连接」随时体检'
            $stateTxt += ''
            $stateTxt += '重要：请关掉 QQ 的自动更新'
            $stateTxt += '  QQ → 左下角菜单 → 设置 → 关于/更新 → 选择「不自动更新」'
            $stateTxt += '  原因：这类工具按 QQ 版本适配，自动升级可能导致连不上。'
            Add-Text ($stateTxt -join "`r`n") 52 200
            $hint.Text = '可以关闭窗口了。'
        }
    }
    $btnBack.Enabled = ($state.step -gt 0 -and $state.step -lt 3)
    $btnNext.Text = if ($state.step -eq 3) { '安装中…' } elseif ($state.step -eq 4) { '完成' } else { '下一步' }
    $btnNext.Enabled = ($state.step -ne 3)
}

function Test-OneBotNow($url, $token) {
    if (-not (Test-Path $Node)) { return '找不到内置 node.exe' }
    $script = Join-Path $App 'scripts\test-onebot.mjs'
    if (-not (Test-Path $script)) { return '缺少测试脚本' }
    $envBackup = @{ url = $env:ONEBOT_WS_URL; token = $env:ONEBOT_TOKEN }
    $env:ONEBOT_WS_URL = $url
    $env:ONEBOT_TOKEN = $token
    try {
        $out = & $Node $script 2>&1
        $last = ($out | Where-Object { $_ } | Select-Object -Last 1)
        return [string]$last
    } catch {
        return '测试失败：' + $_.Exception.Message
    } finally {
        $env:ONEBOT_WS_URL = $envBackup.url
        $env:ONEBOT_TOKEN = $envBackup.token
    }
}

function Do-Install {
    $script:installOk = $false
    $logLines = @()
    $add = { param($m) $logLines += ("[" + (Get-Date -Format 'HH:mm:ss') + "] " + $m); $script:log.Text = ($logLines -join "`r`n"); $script:log.SelectionStart = $script:log.Text.Length; $script:log.ScrollToCaret(); [System.Windows.Forms.Application]::DoEvents() }

    & $add '开始安装…'
    if (-not (Test-Path $Node)) { & $add '✗ 缺少 runtime\node.exe'; return }
    & $add '✓ 运行环境就绪'

    $port = if ($state.port) { $state.port } else { 3870 }
    $skip = '^(DEEPSEEK_API_KEY|WEB_PORT|ONEBOT_DISABLED|ONEBOT_WS_URL|ONEBOT_TOKEN|ALLOWED_QQS|OWNER_QQ|PROACTIVE|BOT_ENV)='
    $tpl = Join-Path $App '.env.example'
    $lines = @()
    if (Test-Path $tpl) { $lines = Get-Content $tpl -Encoding UTF8 | Where-Object { $_ -notmatch $skip } }
    $lines += "DEEPSEEK_API_KEY=$($state.apiKey)"
    $lines += "WEB_PORT=$port"
    $lines += 'ONEBOT_DISABLED=0'
    $lines += "ONEBOT_WS_URL=$($state.url)"
    $lines += "ONEBOT_TOKEN=$($state.token)"
    $lines += "ALLOWED_QQS=$($state.qqs)"
    $first = ($state.qqs -split ',')[0].Trim()
    if ($first) { $lines += "OWNER_QQ=$first" }
    $lines += 'PROACTIVE=1'
    $lines += 'BOT_ENV=local'
    [IO.File]::WriteAllLines($EnvFile, $lines, (New-Object Text.UTF8Encoding $false))
    & $add ('✓ 配置已写入（端口 ' + $port + '）')

    try {
        $desktop = [Environment]::GetFolderPath('Desktop')
        $ws = New-Object -ComObject WScript.Shell
        foreach ($item in @(
                @{ n = '启动林知夏.lnk'; t = '启动.cmd' },
                @{ n = '林知夏 管理后台.lnk'; t = '打开后台.cmd' },
                @{ n = '林知夏 自检.lnk'; t = '自检.cmd' },
                @{ n = '林知夏 测试连接.lnk'; t = '测试连接.cmd' },
                @{ n = '停止林知夏.lnk'; t = '停止.cmd' }
            )) {
            $lnk = $ws.CreateShortcut((Join-Path $desktop $item.n))
            $lnk.TargetPath = (Join-Path $Root $item.t)
            $lnk.WorkingDirectory = $Root
            $lnk.Save()
        }
        & $add '✓ 桌面快捷方式已创建'
    } catch {
        & $add ('! 快捷方式创建失败：' + $_.Exception.Message)
    }

    if (-not $NoStart) {
        & $add '正在启动服务…'
        Start-Process -FilePath (Join-Path $Root '启动.cmd') -WorkingDirectory $Root -WindowStyle Hidden
        $up = $false
        for ($i = 0; $i -lt 40; $i++) {
            if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { $up = $true; break }
            Start-Sleep -Milliseconds 800
            [System.Windows.Forms.Application]::DoEvents()
        }
        if ($up) {
            & $add ('✓ 管理后台已就绪：http://127.0.0.1:' + $port)
            $script:installOk = $true
        } else {
            & $add '✗ 服务没有起来，请看 app\logs\app.out.log'
        }

        & $add '检查 QQ 连接…'
        $r = Test-OneBotNow $state.url $state.token
        & $add ('  ' + $r)
        if ($r -like '连接成功*') {
            & $add '✓ QQ 已连接，可以去 QQ 里发消息了'
            $script:installOk = $true
        } else {
            & $add '! QQ 还没连上（可以稍后双击「林知夏 测试连接」重试）'
        }
    }

    & $add '安装流程结束。'
    $sc = Join-Path $Root '自检.cmd'
    if ((Test-Path $sc) -and (-not $NoStart)) {
        try {
            Start-Process -FilePath 'cmd.exe' -ArgumentList ('/c "' + $sc + '"') | Out-Null
            & $add '已打开自检窗口'
        } catch { }
    }
}

# ---------- 按钮逻辑 ----------
$btnBack.Add_Click({
    if ($state.step -gt 0) {
        # 保存当前步骤输入
        if ($state.step -eq 1 -and $script:tbKey) { $state.apiKey = $script:tbKey.Text.Trim() }
        if ($state.step -eq 2) {
            if ($script:tbUrl) { $state.url = $script:tbUrl.Text.Trim() }
            if ($script:tbToken) { $state.token = $script:tbToken.Text.Trim() }
            if ($script:tbQq) { $state.qqs = $script:tbQq.Text.Trim() }
        }
        $state.step--
        Show-Step
    }
})

$btnNext.Add_Click({
    # 保存当前步骤输入
    if ($state.step -eq 1 -and $script:tbKey) { $state.apiKey = $script:tbKey.Text.Trim() }
    if ($state.step -eq 2) {
        if ($script:tbUrl) { $state.url = $script:tbUrl.Text.Trim() }
        if ($script:tbToken) { $state.token = $script:tbToken.Text.Trim() }
        if ($script:tbQq) { $state.qqs = $script:tbQq.Text.Trim() }
        if (-not $state.url) { $state.url = 'ws://127.0.0.1:3001' }
    }

    if ($state.step -eq 4) {
        $form.Close()
        return
    }

    $state.step++
    Show-Step

    # 安装步骤：跑完自动进下一步
    if ($state.step -eq 3) {
        $script:log.Text = ''
        $btnNext.Enabled = $false
        [System.Windows.Forms.Application]::DoEvents()
        $state.step = 4
        Show-Step
    }
})

$form.Add_Shown({
    if ($PreKey) { $state.apiKey = $PreKey }
    if ($PreQq) { $state.qqs = $PreQq }
    if ($StartStep -ge 0 -and $StartStep -le 4) { $state.step = $StartStep }
    Show-Step
})

[void]$form.ShowDialog()
