# 一键诊断：把客户环境的关键信息打出来，并给结论
# 用法：双击「诊断.cmd」，或 powershell -File diagnose.ps1

$ErrorActionPreference = 'SilentlyContinue'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$App = Join-Path $Root 'app'
$EnvFile = Join-Path $App '.env'

function Line($t) { Write-Host ''; Write-Host ('=== ' + $t + ' ===') -ForegroundColor Cyan }

Write-Host '林知夏 · 环境诊断' -ForegroundColor Green
Write-Host ('时间：' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))

# ---------- 1. 程序自身 ----------
Line '程序'
if (Test-Path (Join-Path $Root 'runtime\node.exe')) { Write-Host '✓ 内置运行环境存在' } else { Write-Host '✗ 缺少 runtime\node.exe，安装包不完整' -ForegroundColor Red }
if (Test-Path $EnvFile) { Write-Host '✓ 配置文件存在 (app\.env)' } else { Write-Host '✗ 没有 app\.env，请先运行一键安装' -ForegroundColor Red }

$port = 0
if (Test-Path $EnvFile) {
    $line = Get-Content $EnvFile -Encoding UTF8 | Where-Object { $_ -match '^WEB_PORT=' } | Select-Object -First 1
    if ($line) { $port = [int](($line -split '=', 2)[1].Trim()) }
}
if (-not $port) { $port = 3870 }
if (Get-NetTCPConnection -LocalPort $port -State Listen) {
    Write-Host ("✓ 管理后台在监听：" + $port)
} else {
    Write-Host ("· 管理后台没在运行（端口 " + $port + "）→ 双击「启动林知夏」") -ForegroundColor Yellow
}

# ---------- 2. QQ ----------
Line 'QQ'
$qqVer = ''
foreach ($k in @('HKLM:\SOFTWARE\WOW6432Node\Tencent\QQNT', 'HKCU:\Software\Tencent\QQNT')) {
    $v = (Get-ItemProperty $k).version
    if ($v) { $qqVer = [string]$v }
}
$qqPath = ''
foreach ($p in @('C:\Program Files\Tencent\QQNT\QQ.exe', 'C:\Program Files (x86)\Tencent\QQNT\QQ.exe')) {
    if (Test-Path $p) { $qqPath = Split-Path $p -Parent; $qqVer = (Get-Item $p).VersionInfo.FileVersion; break }
}
if ((Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Tencent\QQNT').Install) {
    $inst = (Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Tencent\QQNT').Install
    if (Test-Path $inst) { $qqPath = $inst }
}
if ($qqVer) {
    Write-Host ("✓ QQ 已安装：版本 " + $qqVer + "  路径 " + $qqPath)
    if ($qqVer -match '^9\.9\.(3[0-9])') {
        Write-Host '  ! 这是较新的 9.9.3x：NapCat 4.18.x 注入会失败，需要 SnowLuma 这类新版工具' -ForegroundColor Yellow
    } elseif ($qqVer -match '^9\.9\.(2[0-9])') {
        Write-Host '  · 属于旧组合，配 NapCat 4.18.x 可用' -ForegroundColor DarkGray
    }
} else {
    Write-Host '· 没检测到 QQ' -ForegroundColor Yellow
}

# ---------- 3. OneBot / 中间件 ----------
Line 'QQ 连接中间件'
$endpoints = @()
foreach ($p in @(3001, 3000, 5099)) {
    if (Get-NetTCPConnection -LocalPort $p -State Listen) { $endpoints += $p }
}
foreach ($n in @('NapCatWinBootMain', 'napcat', 'SnowLuma')) {
    $proc = Get-Process -Name $n
    if ($proc) { Write-Host ("✓ 进程在跑：" + $n + " (PID " + $proc[0].Id + ")") }
}
$dirs = @()
foreach ($drive in @('C:', 'D:', 'E:', 'F:')) {
    foreach ($name in @('napcat', 'snowluma', 'NapCat')) {
        $d = $drive + '\' + $name
        if (Test-Path $d) { $dirs += $d }
    }
}
if ($dirs.Count) { Write-Host ("· 发现工具目录：" + (($dirs | Select-Object -Unique) -join ', ')) } else { Write-Host '· 没找到常见工具目录' }
if ($endpoints.Count) {
    Write-Host ("✓ 有服务在监听：" + ($endpoints -join ', ')) -ForegroundColor Green
} else {
    Write-Host '✗ 3001 没有监听' -ForegroundColor Red
    if ($dirs.Count -or (Get-Process -Name NapCatWinBootMain, SnowLuma)) {
        Write-Host '  工具装了但端口没起来 → 多半是注入失败或没登录' -ForegroundColor Yellow
        Write-Host '  先看工具自己的窗口/日志；最常见原因是 QQ 版本与工具不匹配' -ForegroundColor Yellow
    } else {
        Write-Host '  还没装中间件 → 按说明书第二节准备' -ForegroundColor Yellow
    }
}

# ---------- 4. 配置 ----------
Line '配置'
if (Test-Path $EnvFile) {
    foreach ($k in @('ONEBOT_DISABLED', 'ONEBOT_WS_URL', 'ONEBOT_TOKEN', 'ALLOWED_QQS', 'OWNER_QQ', 'PROACTIVE')) {
        $l = Get-Content $EnvFile -Encoding UTF8 | Where-Object { $_ -match ("^" + $k + "=") } | Select-Object -First 1
        if ($l) {
            if ($k -eq 'ONEBOT_TOKEN') {
                $val = ($l -split '=', 2)[1]
                Write-Host ("  ONEBOT_TOKEN = " + $(if ($val.Trim()) { '(已设置，长度 ' + $val.Trim().Length + ')' } else { '(空)' }))
            } else {
                Write-Host ('  ' + $l)
            }
        }
    }
    $keyLine = Get-Content $EnvFile -Encoding UTF8 | Where-Object { $_ -match '^DEEPSEEK_API_KEY=' } | Select-Object -First 1
    if ($keyLine) {
        $k = ($keyLine -split '=', 2)[1].Trim()
        Write-Host ('  DEEPSEEK_API_KEY = ' + $(if ($k) { '(已填，长度 ' + $k.Length + ')' } else { '(空！需要填)' }))
    }
}

# ---------- 5. 最近日志 ----------
Line '最近日志（app\logs\app.out.log）'
$log = Join-Path $App 'logs\app.out.log'
if (Test-Path $log) {
    Get-Content $log -Encoding UTF8 | Select-Object -Last 10 | ForEach-Object { Write-Host ('  ' + $_) }
} else {
    Write-Host '  （还没有日志，说明没启动过）' -ForegroundColor Yellow
}

Line '结论'
if ($portsUp = (Get-NetTCPConnection -LocalPort 3001 -State Listen)) {
    Write-Host '配置文件和服务都在，3001 已监听。如果 QQ 里还是不回：' -ForegroundColor Green
    Write-Host '  → 你的 QQ 号没进白名单，去后台「访问权限」补上'
} elseif ($dirs.Count -or (Get-Process -Name NapCatWinBootMain, SnowLuma)) {
    Write-Host '工具装了但没连上，最可能是 QQ 版本与工具不匹配（或没扫码登录）。' -ForegroundColor Yellow
    Write-Host '  1. 看工具窗口有没有报注入失败'
    Write-Host '  2. 换匹配的版本后再试（改版本前先备份 Tencent Files）'
} else {
    Write-Host '还没装中间件。不接 QQ 也能用：桌面「打开聊天」。' -ForegroundColor Yellow
}
Write-Host ''
Write-Host '把上面的内容整段发给我，我能判断具体卡在哪。' -ForegroundColor Cyan
if (-not $env:NO_PAUSE) { Read-Host '按回车关闭' }
