# 启动器：带反馈，避免"双击没反应/黑窗一闪"
# 由 启动.cmd 调用；也可 powershell -File launch.ps1 -Quiet
param([switch]$Quiet)

$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$App = Join-Path $Root 'app'
$Node = Join-Path $Root 'runtime\node.exe'
$EnvFile = Join-Path $App '.env'

function Read-Port {
    if (Test-Path $EnvFile) {
        $l = Get-Content $EnvFile -Encoding UTF8 | Where-Object { $_ -match '^WEB_PORT=' } | Select-Object -First 1
        if ($l) {
            $v = ($l -split '=', 2)[1].Trim()
            if ($v -match '^\d+$') { return [int]$v }
        }
    }
    return 3870
}

function Get-Token {
    $tf = Join-Path $App 'data\web-token'
    if (Test-Path $tf) { return (Get-Content $tf -Raw).Trim() }
    return ''
}

function Open-Chat($port, $token) {
    Start-Process "http://127.0.0.1:$port/?token=$token&module=__sandbox"
}

function Port-Up($port) {
    return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

$port = Read-Port

# 已经装在跑 → 直接打开聊天，不重复启动
if (Port-Up $port) {
    Write-Host '  林知夏已经在运行，正在打开聊天窗口…' -ForegroundColor Green
    Open-Chat $port (Get-Token)
    if (-not $Quiet) { Start-Sleep -Seconds 2 }
    exit 0
}

try {
    if (-not [Environment]::Is64BitOperatingSystem) {
        Write-Host '  [错误] 这是 32 位 Windows，本程序需要 64 位系统。' -ForegroundColor Red
        if (-not $Quiet) { Read-Host '按回车关闭' }
        exit 1
    }
} catch { }

if (-not (Test-Path $Node)) {
    Write-Host '  [错误] 找不到 runtime\node.exe，安装包不完整' -ForegroundColor Red
    if (-not $Quiet) { Read-Host '按回车关闭' }
    exit 1
}
if (-not (Test-Path $EnvFile)) {
    Write-Host '  [错误] 还没有配置：请先双击「一键安装.cmd」' -ForegroundColor Red
    if (-not $Quiet) { Read-Host '按回车关闭' }
    exit 1
}

New-Item -ItemType Directory -Force -Path (Join-Path $App 'logs') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $App 'data') | Out-Null

Write-Host '  正在启动…' -ForegroundColor Cyan
$outLog = Join-Path $App 'logs\app.out.log'
$errLog = Join-Path $App 'logs\app.err.log'
$args = @('--env-file=".env"', '"src\index.mjs"')
Start-Process -FilePath $Node -ArgumentList $args -WorkingDirectory $App -WindowStyle Hidden `
    -RedirectStandardOutput $outLog -RedirectStandardError $errLog | Out-Null

$ok = $false
for ($i = 0; $i -lt 40; $i++) {
    if (Port-Up $port) { $ok = $true; break }
    Start-Sleep -Milliseconds 500
}

if ($ok) {
    Write-Host ("  启动成功：http://127.0.0.1:" + $port) -ForegroundColor Green
    Open-Chat $port (Get-Token)
    Write-Host '  聊天窗口已打开。QQ 那边如果没连上，双击「测试连接」看原因。' -ForegroundColor DarkGray
    if (-not $Quiet) { Start-Sleep -Seconds 3 }
    exit 0
}

Write-Host '  [失败] 服务没有起来。最后几行日志：' -ForegroundColor Red
if (Test-Path $errLog) {
    Get-Content $errLog -Encoding UTF8 -ErrorAction SilentlyContinue | Select-Object -Last 5 | ForEach-Object { Write-Host ('    ' + $_) -ForegroundColor DarkGray }
}
if (Test-Path $outLog) {
    Get-Content $outLog -Encoding UTF8 -ErrorAction SilentlyContinue | Select-Object -Last 5 | ForEach-Object { Write-Host ('    ' + $_) -ForegroundColor DarkGray }
}
Write-Host '  建议：双击「诊断.cmd」，把输出发给卖家。' -ForegroundColor Yellow
if (-not $Quiet) { Read-Host '按回车关闭' }
exit 1
