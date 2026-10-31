# ============================================================
#  升级：只替换程序代码，不动配置、聊天记录、依赖
#
#  用法（客户）：解压升级包，双击「升级.cmd」
#  命令行：
#    powershell -File 升级.ps1 -Yes        静默
#    powershell -File 升级.ps1 -Yes -Force 版本相同也强制覆盖
# ============================================================
param(
    [switch]$Yes,
    [switch]$Force,
    [switch]$NoStart
)

$ErrorActionPreference = 'Continue'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$App = Join-Path $Root 'app'
$EnvFile = Join-Path $App '.env'
$VersionFile = Join-Path $App 'version.json'
$Manifest = Join-Path $Root 'manifest.json'
$Patch = Join-Path $Root '_patch'
$PatchApp = Join-Path $Patch 'app'

function Get-Json($path) {
    if (-not (Test-Path $path)) { return $null }
    try { return Get-Content $path -Raw -Encoding UTF8 | ConvertFrom-Json } catch { return $null }
}

function Get-CurVersion {
    $v = Get-Json $VersionFile
    if ($v -and $v.version) { return [string]$v.version }
    return '1.0.0'
}

function Get-Port {
    if (Test-Path $EnvFile) {
        $line = Get-Content $EnvFile -Encoding UTF8 | Where-Object { $_ -match '^WEB_PORT=' } | Select-Object -First 1
        if ($line) {
            $v = ($line -split '=', 2)[1].Trim()
            if ($v -match '^\d+$') { return [int]$v }
        }
    }
    return 3870
}

function Stop-Bot {
    $killed = 0
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue | ForEach-Object {
        $cl = [string]$_.CommandLine
        if ($cl -and ($cl -match 'index\.mjs') -and ($cl -like "*$Root*")) {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
            $killed++
        }
    }
    $port = Get-Port
    for ($i = 0; $i -lt 12; $i++) {
        $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        if (-not $conn) { break }
        foreach ($c in $conn) {
            try { Stop-Process -Id $c.OwningProcess -Force -ErrorAction Stop; $killed++ } catch { }
        }
        Start-Sleep -Milliseconds 500
    }
    return $killed
}

# ---------- 校验升级包 ----------
if (-not (Test-Path $Manifest)) {
    Write-Host '  [错误] 找不到 manifest.json —— 这不是升级包，或者解压不完整。' -ForegroundColor Red
    Write-Host '        请重新解压升级包，然后再双击「升级.cmd」。' -ForegroundColor Yellow
    if (-not $Yes) { Read-Host '按回车关闭' }
    exit 1
}
$man = Get-Json $Manifest
if (-not $man -or -not $man.version) {
    Write-Host '  [错误] manifest.json 内容不对。' -ForegroundColor Red
    if (-not $Yes) { Read-Host '按回车关闭' }
    exit 1
}
if (-not (Test-Path (Join-Path $App 'src\index.mjs'))) {
    Write-Host '  [错误] 当前目录不像安装目录（找不到 app\src\index.mjs）。' -ForegroundColor Red
    Write-Host '        请把升级包解压到「林知夏」目录里，让 升级.cmd 和 app 文件夹在同一层。' -ForegroundColor Yellow
    if (-not $Yes) { Read-Host '按回车关闭' }
    exit 1
}

$cur = Get-CurVersion
$new = [string]$man.version

Write-Host ''
Write-Host '=========================================' -ForegroundColor Cyan
Write-Host '  林知夏 · 升级' -ForegroundColor Cyan
Write-Host '=========================================' -ForegroundColor Cyan
Write-Host ("  当前版本：" + $cur)
Write-Host ("  升级到：  " + $new)
if ($man.note) { Write-Host ("  更新内容：" + $man.note) }
Write-Host ''

if ($cur -eq $new -and -not $Force) {
    Write-Host '  已经是最新版本，不用升级。' -ForegroundColor Green
    if (-not $Yes) { Read-Host '按回车关闭' }
    exit 0
}

if (-not $Yes) {
    $ans = Read-Host '  开始升级吗？会先自动备份当前版本（输入 y 继续）'
    if ($ans -notmatch '^[Yy]') { Write-Host '  已取消'; exit 0 }
}

# ---------- 停程序 ----------
$killed = Stop-Bot
if ($killed -gt 0) { Write-Host ("  ✓ 已停止程序（$killed 个进程）") } else { Write-Host '  · 程序本来没在跑' }
Start-Sleep -Seconds 1

# ---------- 备份 ----------
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDir = Join-Path $Root ('backup\upgrade-' + $cur + '-' + $stamp)
try {
    New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
    foreach ($d in @('src', 'server', 'web', 'personas', 'stickers', 'scripts')) {
        $srcDir = Join-Path $App $d
        if (Test-Path $srcDir) {
            Copy-Item $srcDir (Join-Path $backupDir $d) -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
    foreach ($f in @('version.json', 'package.json')) {
        $p = Join-Path $App $f
        if (Test-Path $p) { Copy-Item $p (Join-Path $backupDir $f) -Force -ErrorAction SilentlyContinue }
    }
    foreach ($f in (Get-ChildItem $Root -File -Filter '*.ps1')) {
        Copy-Item $f.FullName (Join-Path $backupDir $f.Name) -Force -ErrorAction SilentlyContinue
    }
    Write-Host ('  ✓ 已备份当前版本到：' + $backupDir)
} catch {
    Write-Host ('  ! 备份失败：' + $_.Exception.Message) -ForegroundColor Yellow
    Write-Host '    为了安全，已中止升级（什么都没改）。' -ForegroundColor Yellow
    if (-not $Yes) { Read-Host '按回车关闭' }
    exit 1
}

# ---------- 覆盖代码 ----------
Write-Host '  · 正在替换程序文件…'
$copied = 0
$failed = @()
if (Test-Path $PatchApp) {
    foreach ($item in (Get-ChildItem $PatchApp -Force)) {
        # 绝不能覆盖的内容
        if ($item.Name -in @('data', 'logs', '.env', 'node_modules', '.env.example')) { continue }
        $dest = Join-Path $App $item.Name
        try {
            if ($item.PSIsContainer) {
                # 注意：直接把目录复制到已存在的目标目录会套一层（src\src），必须复制其内容
                New-Item -ItemType Directory -Force -Path $dest | Out-Null
                Copy-Item (Join-Path $item.FullName '*') $dest -Recurse -Force -ErrorAction Stop
            } else {
                Copy-Item $item.FullName $dest -Force -ErrorAction Stop
            }
            $copied++
        } catch {
            $failed += $item.Name
        }
    }
}
# 顶层脚本与说明（_patch 目录里的 .cmd/.ps1/.html/.txt/.json）
foreach ($f in (Get-ChildItem $Patch -File)) {
    if ($f.Name -in @('manifest.json', '升级.cmd', '升级.ps1')) { continue }
    if ($f.Extension -in @('.cmd', '.ps1', '.html', '.txt', '.json')) {
        try {
            Copy-Item $f.FullName (Join-Path $Root $f.Name) -Force -ErrorAction Stop
            $copied++
        } catch {
            $failed += $f.Name
        }
    }
}
Write-Host ("  ✓ 已更新 $copied 项")
if ($failed.Count -gt 0) {
    Write-Host ('  ! 这些没覆盖成功（可能被占用）：' + ($failed -join '、')) -ForegroundColor Yellow
}

# ---------- 写版本号 ----------
$verObj = @{ version = $new; updatedAt = (Get-Date).ToString('s'); from = $cur }
$verObj | ConvertTo-Json | Set-Content -Path $VersionFile -Encoding UTF8
Write-Host ('  ✓ 版本号已写入：' + $new)

# ---------- 启动验证 ----------
if ($NoStart) {
    Write-Host ''
    Write-Host '  升级完成（未启动）。双击「启动林知夏」即可。' -ForegroundColor Green
    if (-not $Yes) { Read-Host '按回车关闭' }
    exit 0
}

$port = Get-Port
Write-Host '  · 正在启动验证…'
Start-Process -FilePath (Join-Path $Root '启动.cmd') -WorkingDirectory $Root -WindowStyle Hidden

$up = $false
for ($i = 0; $i -lt 40; $i++) {
    # 必须同时满足：端口在监听 + 进程来自本安装目录（防止别的实例占着端口造成误判）
    $mine = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and $_.CommandLine -match 'index\.mjs' -and $_.CommandLine -like "*$Root*" }
    if ($mine -and (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)) { $up = $true; break }
    Start-Sleep -Milliseconds 500
}
if ($up) {
    Write-Host ''
    Write-Host '  升级完成，程序已启动。' -ForegroundColor Green
    Write-Host ('  后台：http://127.0.0.1:' + $port) -ForegroundColor Cyan
    if (-not $Yes) { Read-Host '按回车关闭' }
    exit 0
}

# ---------- 失败回滚 ----------
Write-Host ''
Write-Host '  [失败] 新版没起来，正在回滚…' -ForegroundColor Red
foreach ($d in @('src', 'server', 'web', 'personas', 'stickers', 'scripts')) {
    $b = Join-Path $backupDir $d
    if (-not (Test-Path $b)) { continue }
    $dest = Join-Path $App $d
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    Copy-Item (Join-Path $b '*') $dest -Recurse -Force -ErrorAction SilentlyContinue
}
Get-ChildItem $backupDir -File -Filter '*.ps1' -ErrorAction SilentlyContinue | ForEach-Object {
    Copy-Item $_.FullName (Join-Path $Root $_.Name) -Force -ErrorAction SilentlyContinue
}
$bv = Join-Path $backupDir 'version.json'
if (Test-Path $bv) { Copy-Item $bv $VersionFile -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 1
Start-Process -FilePath (Join-Path $Root '启动.cmd') -WorkingDirectory $Root -WindowStyle Hidden
for ($i = 0; $i -lt 30; $i++) {
    $mine = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and $_.CommandLine -match 'index\.mjs' -and $_.CommandLine -like "*$Root*" }
    if ($mine) { break }
    Start-Sleep -Milliseconds 500
}
Write-Host '  已回滚到升级前版本。' -ForegroundColor Yellow
Write-Host '  请把 backup 目录里的东西和日志发给卖家。' -ForegroundColor Yellow
if (-not $Yes) { Read-Host '按回车关闭' }
exit 1
