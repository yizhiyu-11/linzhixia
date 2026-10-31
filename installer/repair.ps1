# ============================================================
#  兼容性修复：检测 QQ/中间件版本 → 给建议 → 经同意后下载并配置中间件
#
#  powershell -File repair.ps1                 交互式
#  powershell -File repair.ps1 -DryRun         只诊断
#  powershell -File repair.ps1 -Yes            同意自动下载
#  powershell -File repair.ps1 -Target napcat -InstallDir C:\napcat -BotQq 123456
#  powershell -File repair.ps1 -ZipPath D:\NapCat.Shell.zip -NoDownload   用本地包
#
#  明确不做：替换或降级用户已安装的 QQ
# ============================================================
param(
    [switch]$DryRun,
    [switch]$Yes,
    [switch]$DownloadOnly,
    [switch]$NoDownload,
    [switch]$SkipLaunch,
    [switch]$DryLaunch,
    [string]$Target = '',
    [string]$InstallDir = '',
    [string]$BotQq = '',
    [string]$ZipPath = ''
)

$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$CompatFile = Join-Path $Root 'compat.json'
$Utf8 = New-Object Text.UTF8Encoding $false

function Line($t) { Write-Host ''; Write-Host ('=== ' + $t + ' ===') -ForegroundColor Cyan }
function Ok($t) { Write-Host ('  ✓ ' + $t) -ForegroundColor Green }
function Warn($t) { Write-Host ('  ! ' + $t) -ForegroundColor Yellow }
function Bad($t) { Write-Host ('  ✗ ' + $t) -ForegroundColor Red }

if (-not (Test-Path $CompatFile)) { Bad '缺少 compat.json'; exit 1 }
$compat = Get-Content $CompatFile -Raw -Encoding UTF8 | ConvertFrom-Json

# ---------- 检测 ----------
function Get-Qq {
    $info = @{ version = ''; path = '' }
    foreach ($k in @('HKLM:\SOFTWARE\WOW6432Node\Tencent\QQNT', 'HKCU:\Software\Tencent\QQNT')) {
        $p = Get-ItemProperty $k -ErrorAction SilentlyContinue
        if ($p.version) { $info.version = [string]$p.version }
        if ($p.Install -and (Test-Path $p.Install)) { $info.path = $p.Install }
    }
    foreach ($exe in @('C:\Program Files\Tencent\QQNT\QQ.exe', 'C:\Program Files (x86)\Tencent\QQNT\QQ.exe')) {
        if (Test-Path $exe) {
            $info.path = Split-Path $exe -Parent
            $info.version = (Get-Item $exe).VersionInfo.FileVersion
            break
        }
    }
    return $info
}

function Get-Tools {
    $found = @()
    foreach ($drive in @('C:', 'D:', 'E:', 'F:')) {
        foreach ($name in @('napcat', 'snowluma')) {
            $dir = $drive + '\' + $name
            if (-not (Test-Path $dir)) { continue }
            $ver = '未知'
            $marker = if ($name -eq 'napcat') { 'qqnt.json' } else { 'package.json' }
            $mf = Join-Path $dir $marker
            if (Test-Path $mf) {
                try { $ver = (Get-Content $mf -Raw -Encoding UTF8 | ConvertFrom-Json).version } catch { }
            }
            $found += [pscustomobject]@{ kind = $name; dir = $dir; version = $ver }
        }
    }
    return $found
}

$qq = Get-Qq
$tools = @(Get-Tools)
$portOpen = [bool](Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue)

Line '环境'
if ($qq.version) { Ok ('QQ ' + $qq.version + '  ' + $qq.path) } else { Warn '没检测到 QQ' }
foreach ($t in $tools) { Ok ('发现 ' + $t.kind + '：' + $t.dir + '（标记 ' + $t.version + '）') }
if ($tools.Count -eq 0) { Warn '没发现 NapCat / SnowLuma 目录' }
if ($portOpen) { Ok '3001 已监听（OneBot 就绪）' } else { Warn '3001 没有监听' }

$minor = -1
if ($qq.version -match '^9\.9\.(\d+)') { $minor = [int]$Matches[1] }

Line '判断'
$suggest = ''
if ($portOpen) {
    Ok '连接正常，不需要修复'
} elseif ($minor -ge 30) {
    Warn ('QQ ' + $qq.version + ' 是 9.9.3x：NapCat 4.18.x 会注入失败，建议 SnowLuma')
    $suggest = 'snowluma'
} elseif ($minor -ge 20) {
    Warn ('QQ ' + $qq.version + ' 是 9.9.2x：配 NapCat 4.18.x 可用')
    $suggest = 'napcat'
} else {
    Warn 'QQ 版本无法判断，默认推荐 SnowLuma（对新版兼容更好）'
    $suggest = 'snowluma'
}
Write-Host '  不会替换或降级你已安装的 QQ（本地聊天数据库可能不兼容）。' -ForegroundColor DarkGray

if ($DryRun) {
    Line '试运行'
    Write-Host '  只诊断，不下载。去掉 -DryRun 才会安装。'
    exit 0
}

# ---------- 目标与安装目录 ----------
if (-not $Target) { $Target = if ($suggest) { $suggest } else { 'snowluma' } }
$dl = $compat.downloads.$Target
if (-not $dl) { Bad ('compat.json 缺少 ' + $Target); exit 1 }
if ($Target -eq 'napcat' -and $minor -ge 30) {
    Warn '你选的是 NapCat，但你的 QQ 是 9.9.3x，装完很可能注入失败。'
}
if (-not $InstallDir) { $InstallDir = if ($Target -eq 'napcat') { 'C:\napcat' } else { 'C:\snowluma' } }

Line '准备'
Write-Host ('  工具：' + $Target)
Write-Host ('  来源：' + $dl.official)
Write-Host ('  大小：约 ' + $dl.sizeMB + ' MB')
Write-Host ('  装到：' + $InstallDir)
Write-Host ('  许可：' + $dl.license) -ForegroundColor Yellow

if (-not $Yes) {
    $ans = Read-Host '  同意下载并安装吗？输入 y 继续'
    if ($ans -notmatch '^[Yy]') { Write-Host '  已取消'; exit 0 }
}

# ---------- 取得压缩包 ----------
Line '获取安装包'
$zip = $ZipPath
if ($zip -and -not (Test-Path $zip)) {
    Bad ('指定的压缩包不存在：' + $zip)
    exit 1
}
if (-not $zip) { $zip = Join-Path $env:TEMP $dl.zipName }

if ($NoDownload) {
    if (-not (Test-Path $zip)) {
        Bad ('离线模式需要本地压缩包：' + $zip)
        Write-Host '  用 -ZipPath 指定，或去掉 -NoDownload 联网下载'
        exit 1
    }
    Ok ('使用本地压缩包：' + $zip)
} else {
    Remove-Item $zip -Force -ErrorAction SilentlyContinue
    $mirrors = @()
    if ($dl.url -like 'https://gh-proxy.com/*') {
        $mirrors += ($dl.url -replace '^https://gh-proxy\.com/', '')
        $mirrors += $dl.url
    } else {
        $mirrors += $dl.url
    }
    $mirrors = @($mirrors | Select-Object -Unique)
    $hasCurl = [bool](Get-Command curl.exe -ErrorAction SilentlyContinue)
    $got = $false
    foreach ($u in $mirrors) {
        Write-Host ('  尝试：' + $u)
        try {
            if ($hasCurl) {
                & curl.exe -L --fail --max-time 900 --retry 1 -o $zip $u
                if ($LASTEXITCODE -ne 0) { throw ('curl ' + $LASTEXITCODE) }
            } else {
                $ProgressPreference = 'SilentlyContinue'
                Invoke-WebRequest $u -OutFile $zip -TimeoutSec 600
            }
            if ((Get-Item $zip -ErrorAction SilentlyContinue).Length -gt 100KB) { $got = $true; break }
            Warn '文件太小，换下一个地址'
            Remove-Item $zip -Force -ErrorAction SilentlyContinue
        } catch {
            Warn ('失败：' + $_.Exception.Message)
        }
    }
    if (-not $got) {
        Bad '所有下载地址都失败'
        Write-Host ('  手动下载：' + $dl.official)
        Write-Host '  然后用 -ZipPath 指定本地文件'
        exit 1
    }
    Ok ('下载完成（' + [math]::Round((Get-Item $zip).Length / 1MB, 1) + ' MB）')
}

if ($DownloadOnly) {
    Line '仅下载'
    Write-Host ('  压缩包位置：' + $zip)
    Write-Host '  要安装请去掉 -DownloadOnly'
    exit 0
}

# ---------- 解压 ----------
Line '安装'
try {
    if (Test-Path $InstallDir) {
        $backup = $InstallDir + '.old-' + (Get-Date -Format 'HHmmss')
        Move-Item $InstallDir $backup -Force
        Warn ('已有目录，已改名保留：' + $backup)
    }
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
    Expand-Archive -Path $zip -DestinationPath $InstallDir -Force
    Ok ('已解压到 ' + $InstallDir)
} catch {
    Bad ('解压失败：' + $_.Exception.Message)
    exit 1
}

Line '校验'
$missing = @()
foreach ($need in $dl.entries) {
    if (Test-Path (Join-Path $InstallDir $need)) { Ok ('找到 ' + $need) } else { Bad ('缺少 ' + $need); $missing += $need }
}
if ($missing.Count) {
    Write-Host ('  包结构不符合预期，可能版本变了：' + $dl.official)
    exit 1
}

# ---------- NapCat 配置 ----------
if ($Target -eq 'napcat') {
    if (-not $BotQq) { $BotQq = Read-Host '  机器人 QQ 号（用于生成 OneBot 配置，可留空跳过）' }
    if ($BotQq) {
        $cfgDir = Join-Path $InstallDir 'config'
        New-Item -ItemType Directory -Force -Path $cfgDir | Out-Null
        $cfgFile = Join-Path $cfgDir ('onebot11_' + $BotQq + '.json')
        $cfg = @'
{
  "network": {
    "httpServers": [],
    "httpSseServers": [],
    "httpClients": [],
    "websocketServers": [
      {
        "name": "ai-gf",
        "enable": true,
        "host": "127.0.0.1",
        "port": 3001,
        "messagePostFormat": "array",
        "reportSelfMessage": false,
        "token": "",
        "enableForcePushEvent": true,
        "debug": false,
        "heartInterval": 30000
      }
    ],
    "websocketClients": [],
    "plugins": []
  },
  "musicSignUrl": "",
  "enableLocalFile2Url": false,
  "parseMultMsg": false,
  "imageDownloadProxy": "",
  "timeout": { "baseTimeout": 10000, "uploadSpeedKBps": 256, "downloadSpeedKBps": 256, "maxTimeout": 1800000 }
}
'@
        [IO.File]::WriteAllText($cfgFile, $cfg, $Utf8)
        Ok ('已生成 OneBot 配置：' + $cfgFile)
    } else {
        Warn '没填 QQ 号，跳过配置生成（启动后它会在 config 目录生成，改端口为 3001 即可）'
    }
}

# ---------- 启动工具 ----------
Line '启动中间件'
$launched = $false
if ($Target -eq 'napcat') {
    $boot = Join-Path $InstallDir 'NapCatWinBootMain.exe'
    $hook = Join-Path $InstallDir 'NapCatWinBootHook.dll'
    $qqExe = if ($qq.path) { Join-Path $qq.path 'QQ.exe' } else { '' }
    if ((Test-Path $boot) -and (Test-Path $hook) -and $qqExe -and (Test-Path $qqExe) -and $BotQq) {
        $ans = if ($SkipLaunch) { 'n' } else { 'y' }
        if (-not $Yes -and -not $SkipLaunch) {
            Write-Host ('  现在启动 NapCat 吗？（会接管你已登录的 QQ：' + $qqExe + '）')
            $ans = Read-Host '  输入 y 启动，回车跳过'
        }
        if ($ans -match '^[Yy]') {
            $qqRunning = [bool](Get-Process -Name 'QQ' -ErrorAction SilentlyContinue)
            Write-Host ''
            Write-Host '  ┌────────────────────────────────────────────┐' -ForegroundColor Yellow
            Write-Host '  │  注意：接下来 QQ 会关闭并重启一次          │' -ForegroundColor Yellow
            Write-Host '  │  NapCat 需要接管 QQ 进程才能工作           │' -ForegroundColor Yellow
            Write-Host '  │  请先保存好正在编辑的内容                  │' -ForegroundColor Yellow
            Write-Host '  └────────────────────────────────────────────┘' -ForegroundColor Yellow
            if ($qqRunning) { Write-Host '  检测到 QQ 正在运行，会被关闭。' -ForegroundColor Yellow }
            Write-Host '  5 秒后继续，按 Ctrl+C 可取消…' -ForegroundColor DarkGray
            for ($c = 5; $c -gt 0; $c--) { Write-Host ("  " + $c) -NoNewline; Start-Sleep -Seconds 1 }
            Write-Host ''
            if ($DryLaunch) {
                Write-Host '  [试运行] 命令为：' -ForegroundColor DarkGray
                Write-Host ('    "' + $boot + '" "' + $qqExe + '" "' + $hook + '" -q ' + $BotQq) -ForegroundColor DarkGray
                $launched = $false
            } else {
            try {
                Start-Process -FilePath $boot -ArgumentList ('"' + $qqExe + '" "' + $hook + '" -q ' + $BotQq) -WorkingDirectory $InstallDir | Out-Null
                $launched = $true
                Ok '已启动 NapCat（QQ 会重启一次，正常）'
            } catch {
                Warn ('启动失败：' + $_.Exception.Message)
            }
            }
        }
    } else {
        Warn '缺少启动所需信息（QQ 路径 / 机器人号 / 引导文件），跳过自动启动'
    }
} else {
    $launcher = Join-Path $InstallDir 'launcher.bat'
    if (Test-Path $launcher) {
        $ans = if ($SkipLaunch) { 'n' } else { 'y' }
        if (-not $Yes -and -not $SkipLaunch) {
            Write-Host '  现在启动 SnowLuma 吗？（它会在 5099 开一个网页控制台）'
            $ans = Read-Host '  输入 y 启动，回车跳过'
        }
        if ($ans -match '^[Yy]') {
            try {
                Start-Process -FilePath 'cmd.exe' -ArgumentList ('/c "' + $launcher + '"') -WorkingDirectory $InstallDir -WindowStyle Minimized | Out-Null
                $launched = $true
                Ok '已启动 SnowLuma（窗口已最小化，别关它）'
            } catch {
                Warn ('启动失败：' + $_.Exception.Message)
            }
        }
    }
}

# 等端口起来
if ($launched) {
    Write-Host '  等待 OneBot 端口 3001 …'
    $up = $false
    for ($i = 0; $i -lt 30; $i++) {
        if (Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue) { $up = $true; break }
        Start-Sleep -Seconds 2
    }
    if ($up) {
        Ok '3001 已就绪'
    } else {
        Warn '3001 还没起来（多半是还在登录/扫码）'
    }
}

# ---------- 下一步 ----------
Line '下一步'
if ($Target -eq 'napcat') {
    $boot = Join-Path $InstallDir 'NapCatWinBootMain.exe'
    $hook = Join-Path $InstallDir 'NapCatWinBootHook.dll'
    $qqExe = if ($qq.path) { Join-Path $qq.path 'QQ.exe' } else { 'QQ路径\QQ.exe' }
    $uin = if ($BotQq) { $BotQq } else { '机器人号' }
    if ($launched) {
        Write-Host '  1. 刚弹出的 QQ 窗口里按提示扫码登录'
        Write-Host '  2. 登录后等 10 秒，回安装向导点「测试连接」'
        Write-Host '  3. 连上了就去 QQ 里发条消息试试'
    } else {
        Write-Host '  1. 确认 QQ 已登录'
        Write-Host ('  2. 启动：' + $boot + ' "' + $qqExe + '" "' + $hook + '" -q ' + $uin)
        Write-Host '  3. 等它打印 WebSocket 服务已启动'
    }
} else {
    if ($launched) {
        Start-Process 'http://127.0.0.1:5099'
        Write-Host '  已帮你打开控制台网页（http://127.0.0.1:5099）'
        Write-Host '  初始密码在 SnowLuma 那个最小化窗口里（找 password 那行）'
        Write-Host '  1. 登录 → 按引导接入 QQ（扫码）'
        Write-Host '  2. 新建 OneBot WebSocket 服务，端口填 3001，保存并启用'
        Write-Host '  3. 回安装向导点「测试连接」'
    } else {
        Write-Host '  1. 先启动并登录 QQ'
        Write-Host ('  2. 运行：' + (Join-Path $InstallDir 'launcher.bat'))
        Write-Host '  3. 浏览器打开 http://127.0.0.1:5099 接入 QQ，OneBot WebSocket 端口填 3001'
    }
}
Write-Host '  4. 回安装向导点「测试连接」验证'
Write-Host ''
