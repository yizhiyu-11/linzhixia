# ============================================================
#  林知夏 · 本地版 一键安装（接 QQ 模式）
#  写配置 → 建快捷方式 → 启动 → 检查 QQ 连接
# ============================================================
param(
    [string]$ApiKey = '',
    [string]$OneBotUrl = '',
    [string]$OneBotToken = '',
    [string]$AllowedQqs = '',
    [switch]$NoStart,
    [switch]$NoShortcut,
    [switch]$Silent
)
$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$App  = Join-Path $Root 'app'
$Node = Join-Path $Root 'runtime\node.exe'
$EnvFile = Join-Path $App '.env'

Write-Host ''
Write-Host '=========================================' -ForegroundColor Cyan
Write-Host '  林知夏 AI 角色对话系统 · 本地版 安装' -ForegroundColor Cyan
Write-Host '=========================================' -ForegroundColor Cyan
Write-Host ''

# ---------- 1. 检查文件 ----------
if (-not (Test-Path $Node)) { Write-Host '[错误] 找不到 runtime\node.exe，安装包不完整。' -ForegroundColor Red; if (-not $Silent) { Read-Host '按回车退出' }; exit 1 }
if (-not (Test-Path (Join-Path $App 'src\index.mjs'))) { Write-Host '[错误] 找不到 app\src\index.mjs，安装包不完整。' -ForegroundColor Red; if (-not $Silent) { Read-Host '按回车退出' }; exit 1 }
Write-Host '[1/5] 文件检查通过' -ForegroundColor Green

# 32 位系统：内置的 node.exe 是 64 位，跑不了
try {
    if (-not [Environment]::Is64BitOperatingSystem) {
        Write-Host '[错误] 这是 32 位 Windows，程序需要 64 位系统。' -ForegroundColor Red
        Write-Host '       右键「此电脑」→ 属性，看「系统类型」是否为 64 位。' -ForegroundColor Yellow
        if (-not $Silent) { Read-Host '按回车退出' }
        exit 1
    }
} catch { }

# 磁盘空间：至少 300MB（程序 120MB + 数据余量）
try {
    $free = (Get-PSDrive -Name ((Split-Path $Root -Qualifier).TrimEnd(':'))).Free
    if ($free -lt 300MB) {
        Write-Host ('[错误] 安装盘只剩 ' + [math]::Round($free / 1MB) + ' MB，至少需要 300 MB。') -ForegroundColor Red
        Write-Host '       把文件夹挪到空间大的盘，或先清理磁盘。' -ForegroundColor Yellow
        if (-not $Silent) { Read-Host '按回车退出' }
        exit 1
    }
} catch { }

# ---------- 2. 找可用端口 ----------
$port = 0
foreach ($p in 3870..3885) {
    $busy = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
    if (-not $busy) { $port = $p; break }
}
if ($port -eq 0) { Write-Host '[错误] 3870-3885 端口都被占用了。' -ForegroundColor Red; if (-not $Silent) { Read-Host '按回车退出' }; exit 1 }
Write-Host "[2/5] 管理后台使用端口 $port" -ForegroundColor Green

# ---------- 3. 模型 API Key ----------
$key = $ApiKey
if ([string]::IsNullOrWhiteSpace($key) -and (Test-Path $EnvFile)) {
    $line = Get-Content $EnvFile -Encoding UTF8 | Where-Object { $_ -match '^DEEPSEEK_API_KEY=' } | Select-Object -First 1
    if ($line) { $key = ($line -split '=', 2)[1].Trim() }
}
if (-not $Silent -and [string]::IsNullOrWhiteSpace($key)) {
    Write-Host ''
    Write-Host '【1】模型 API Key（DeepSeek 平台申请，形如 sk-xxxxxxxx）' -ForegroundColor Yellow
    Write-Host '     没有可直接回车跳过，装完在管理后台「模型」页填。' -ForegroundColor DarkGray
    $key = Read-Host '     粘贴 Key'
}

# ---------- 4. QQ 连接信息 ----------
$url = $OneBotUrl
if (-not $url -and (Test-Path $EnvFile)) {
    $line = Get-Content $EnvFile -Encoding UTF8 | Where-Object { $_ -match '^ONEBOT_WS_URL=' } | Select-Object -First 1
    if ($line) { $url = ($line -split '=', 2)[1].Trim() }
}
if ([string]::IsNullOrWhiteSpace($url)) { $url = 'ws://127.0.0.1:3001' }

$token = $OneBotToken
if (-not $Silent) {
    Write-Host ''
    Write-Host '【2】QQ 连接（需要先在你电脑上运行好 OneBot 服务，例如 NapCat）' -ForegroundColor Yellow
    Write-Host "     默认地址 $url，直接回车使用默认。" -ForegroundColor DarkGray
    $inputUrl = Read-Host '     OneBot 地址'
    if (-not [string]::IsNullOrWhiteSpace($inputUrl)) { $url = $inputUrl.Trim() }
    Write-Host '     如果 OneBot 设了 token 就填，没有就回车。' -ForegroundColor DarkGray
    $inputToken = Read-Host '     OneBot Token'
    if (-not [string]::IsNullOrWhiteSpace($inputToken)) { $token = $inputToken.Trim() }
}

$qqs = $AllowedQqs
if (-not $Silent -and [string]::IsNullOrWhiteSpace($qqs)) {
    Write-Host ''
    Write-Host '【3】谁能和她聊天（填 QQ 号，多个用英文逗号）' -ForegroundColor Yellow
    Write-Host '     比如 123456789,987654321；第一个会当成"主人"（收主动消息）。' -ForegroundColor DarkGray
    $qqs = Read-Host '     QQ 号'
}
if ([string]::IsNullOrWhiteSpace($qqs)) {
    Write-Host ''
    Write-Host '[提示] 没填白名单：她不会响应任何人。装完可在管理后台「访问权限」补。' -ForegroundColor DarkGray
}

# ---------- 5. 写配置 ----------
$tpl = Join-Path $App '.env.example'
$skip = '^(DEEPSEEK_API_KEY|WEB_PORT|ONEBOT_DISABLED|ONEBOT_WS_URL|ONEBOT_TOKEN|ALLOWED_QQS|OWNER_QQ|PROACTIVE|BOT_ENV)='
$lines = @()
if (Test-Path $tpl) {
    $lines = Get-Content $tpl -Encoding UTF8 | Where-Object { $_ -notmatch $skip }
}
$lines += "DEEPSEEK_API_KEY=$key"
$lines += "WEB_PORT=$port"
$lines += 'ONEBOT_DISABLED=0'
$lines += "ONEBOT_WS_URL=$url"
$lines += "ONEBOT_TOKEN=$token"
$lines += "ALLOWED_QQS=$qqs"
$first = ($qqs -split ',')[0].Trim()
if ($first) { $lines += "OWNER_QQ=$first" }
$lines += 'PROACTIVE=1'
$lines += 'BOT_ENV=local'
[IO.File]::WriteAllLines($EnvFile, $lines, (New-Object Text.UTF8Encoding $false))
Write-Host '[3/5] 配置已写入 app\.env' -ForegroundColor Green

# ---------- 6. 快捷方式 ----------
$desktop = [Environment]::GetFolderPath('Desktop')
$ws = New-Object -ComObject WScript.Shell

function New-Shortcut($name, $target, $args) {
    $lnk = $ws.CreateShortcut((Join-Path $desktop $name))
    $lnk.TargetPath = $target
    if ($args) { $lnk.Arguments = $args }
    $lnk.WorkingDirectory = $Root
    $lnk.Save()
}

if (-not $NoShortcut) {
    New-Shortcut '启动林知夏.lnk' (Join-Path $Root '启动.cmd') ''
    New-Shortcut '林知夏 管理后台.lnk' (Join-Path $Root '打开后台.cmd') ''
    New-Shortcut '林知夏 自检.lnk' (Join-Path $Root '自检.cmd') ''
    New-Shortcut '林知夏 测试连接.lnk' (Join-Path $Root '测试连接.cmd') ''
    New-Shortcut '停止林知夏.lnk' (Join-Path $Root '停止.cmd') ''
    Write-Host '[4/5] 桌面快捷方式已创建' -ForegroundColor Green
} else {
    Write-Host '[4/5] 跳过快捷方式（测试模式）' -ForegroundColor DarkGray
}

if ($NoStart) {
    Write-Host ''
    Write-Host '[测试] 配置已写入，未启动。' -ForegroundColor Yellow
    exit 0
}

# ---------- 7. 启动 ----------
Write-Host ''
Write-Host '正在启动…' -ForegroundColor Cyan
Start-Process -FilePath (Join-Path $Root '启动.cmd') -WorkingDirectory $Root -WindowStyle Hidden

$up = $false
for ($i = 0; $i -lt 40; $i++) {
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { $up = $true; break }
    Start-Sleep -Seconds 1
}

if (-not $up) {
    Write-Host ''
    Write-Host '[警告] 管理后台没有起来，请看 app\logs\app.out.log。' -ForegroundColor Red
    if (-not $Silent) { Read-Host '按回车关闭' }
    exit 1
}

# ---------- 8. 测 QQ 连接 ----------
Write-Host '[5/5] 检查 QQ 连接…' -ForegroundColor Green
$testScript = Join-Path $App 'scripts\test-onebot.mjs'
$qqOk = $false
if (Test-Path $testScript) {
    Push-Location $App
    try {
        $out = & $Node $testScript 2>&1
        $out | Select-Object -Last 3 | ForEach-Object { '     ' + $_ }
        if ($LASTEXITCODE -eq 0) { $qqOk = $true }
    } catch {
        Write-Host ('     连接检查失败：' + $_.Exception.Message) -ForegroundColor DarkGray
    }
    Pop-Location
}

Write-Host ''
Write-Host '=========================================' -ForegroundColor Green
Write-Host '  安装完成' -ForegroundColor Green
Write-Host '=========================================' -ForegroundColor Green
Write-Host ''
if ($qqOk) {
    Write-Host '  QQ 连接正常，去 QQ 里给机器人号发条消息试试。' -ForegroundColor Green
} else {
    Write-Host '  还没连上 QQ，请确认：' -ForegroundColor Yellow
    Write-Host '    1. OneBot 服务（如 NapCat）已经启动' -ForegroundColor Yellow
    Write-Host '    2. 地址和 token 与 OneBot 配置一致' -ForegroundColor Yellow
    Write-Host '    3. 机器人 QQ 已经登录' -ForegroundColor Yellow
    Write-Host '  改好后双击桌面「林知夏 测试连接」再试。' -ForegroundColor Yellow
}
Write-Host ''
Write-Host '  管理后台（改人设/参数）：桌面「林知夏 管理后台」' -ForegroundColor Cyan
Write-Host '  也可以用浏览器直接聊：桌面「打开聊天」' -ForegroundColor Cyan
Write-Host ''
if (-not $Silent) {
    $token2 = ''
    $tf = Join-Path $App 'data\web-token'
    if (Test-Path $tf) { $token2 = (Get-Content $tf -Raw).Trim() }
    $selfCheck = Join-Path $Root '自检.cmd'
    if (Test-Path $selfCheck) {
        Start-Process -FilePath 'cmd.exe' -ArgumentList ('/c "' + $selfCheck + '"') | Out-Null
    } else {
        Start-Process "http://127.0.0.1:$port/?token=$token2"
    }
    Read-Host '按回车关闭此窗口'
}
