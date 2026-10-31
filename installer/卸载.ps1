# ============================================================
#  卸载：停程序 → 可选备份聊天记录 → 删快捷方式 → 删安装目录
#
#  双击「卸载.cmd」
#  命令行：
#    powershell -File 卸载.ps1 -Yes                 静默，保留记录并备份到桌面
#    powershell -File 卸载.ps1 -Yes -DeleteData     连记录一起删
#    powershell -File 卸载.ps1 -Yes -BackupTo D:\bk 备份到指定目录
# ============================================================
param(
    [switch]$Yes,
    [switch]$DeleteData,
    [string]$BackupTo = ''
)

$ErrorActionPreference = 'Continue'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$App = Join-Path $Root 'app'
$DataDir = Join-Path $App 'data'
$EnvFile = Join-Path $App '.env'

$SHORTCUTS = @(
    '启动林知夏.lnk',
    '林知夏 管理后台.lnk',
    '林知夏 自检.lnk',
    '林知夏 测试连接.lnk',
    '停止林知夏.lnk'
)

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

# ---------- 停程序 ----------
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
            try {
                Stop-Process -Id $c.OwningProcess -Force -ErrorAction Stop
                $killed++
            } catch { }
        }
        Start-Sleep -Milliseconds 500
    }
    for ($i = 0; $i -lt 10; $i++) {
        if (-not (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)) { break }
        Start-Sleep -Milliseconds 500
    }
    return $killed
}

# ---------- 统计 ----------
$sizeMB = 0
if (Test-Path $Root) {
    $sum = (Get-ChildItem $Root -Recurse -File -Force -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
    if ($sum) { $sizeMB = [math]::Round($sum / 1MB, 1) }
}
$dbPath = Join-Path $DataDir 'bot.db'
$dbSize = if (Test-Path $dbPath) { [math]::Round((Get-Item $dbPath).Length / 1KB) } else { 0 }
$desktop = [Environment]::GetFolderPath('Desktop')
$existing = @($SHORTCUTS | Where-Object { Test-Path (Join-Path $desktop $_) })

# ---------- 交互确认 ----------
$doIt = [bool]$Yes
$keepFlag = -not [bool]$DeleteData

if (-not $Yes) {
    $form = New-Object System.Windows.Forms.Form
    $form.Text = '卸载林知夏'
    $form.Size = New-Object System.Drawing.Size(560, 400)
    $form.StartPosition = 'CenterScreen'
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false
    $form.BackColor = [System.Drawing.Color]::FromArgb(248, 249, 252)
    $form.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 9)

    $t = New-Object System.Windows.Forms.Label
    $t.SetBounds(24, 18, 500, 28)
    $t.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 14, [System.Drawing.FontStyle]::Bold)
    $t.Text = '确定要卸载吗？'
    $form.Controls.Add($t)

    $info = New-Object System.Windows.Forms.Label
    $info.SetBounds(26, 56, 500, 96)
    $info.Text = "将要删除：`r`n· 程序文件（约 $sizeMB MB）`r`n· 桌面快捷方式（$($existing.Count) 个）`r`n· 安装目录：$Root"
    $form.Controls.Add($info)

    $cbKeep = New-Object System.Windows.Forms.CheckBox
    $cbKeep.SetBounds(26, 160, 500, 26)
    $cbKeep.Checked = $true
    $cbKeep.Text = "保留聊天记录（先备份到桌面，$dbSize KB）"
    $form.Controls.Add($cbKeep)

    $warn = New-Object System.Windows.Forms.Label
    $warn.SetBounds(26, 192, 500, 44)
    $warn.ForeColor = [System.Drawing.Color]::FromArgb(180, 90, 20)
    $warn.Text = '注意：勾选「保留」会把 data 文件夹复制到桌面；不勾选则一起删除，删了找不回来。'
    $form.Controls.Add($warn)

    $note = New-Object System.Windows.Forms.Label
    $note.SetBounds(26, 240, 500, 50)
    $note.ForeColor = [System.Drawing.Color]::FromArgb(120, 126, 138)
    $note.Text = '卸载不会动你的 QQ、不会改系统设置、不会删除系统里其它文件。'
    $form.Controls.Add($note)

    $btnCancel = New-Object System.Windows.Forms.Button
    $btnCancel.SetBounds(300, 306, 100, 34)
    $btnCancel.Text = '取消'
    $form.Controls.Add($btnCancel)

    $btnOk = New-Object System.Windows.Forms.Button
    $btnOk.SetBounds(408, 306, 110, 34)
    $btnOk.Text = '卸载'
    $btnOk.BackColor = [System.Drawing.Color]::FromArgb(210, 60, 50)
    $btnOk.ForeColor = [System.Drawing.Color]::White
    $btnOk.FlatStyle = 'Flat'
    $form.Controls.Add($btnOk)

    $btnCancel.Add_Click({ $form.Close() })
    $btnOk.Add_Click({
        $script:confirmed = $true
        $script:keepChoice = $cbKeep.Checked
        $form.Close()
    })

    [void]$form.ShowDialog()
    $doIt = [bool]$script:confirmed
    if ($null -ne $script:keepChoice) { $keepFlag = [bool]$script:keepChoice }
}

if (-not $doIt) {
    Write-Host '  已取消，什么都没删。'
    exit 0
}

# ---------- 停程序 ----------
Write-Host ''
$killed = Stop-Bot
if ($killed -gt 0) { Write-Host ("  ✓ 已停止程序（$killed 个进程）") } else { Write-Host '  · 程序本来就没在跑' }
Start-Sleep -Seconds 1

$port = Get-Port
if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
    Write-Host ('  ! 端口 ' + $port + ' 还被占用，继续卸载，但目录可能删不掉。') -ForegroundColor Yellow
}

# ---------- 备份 ----------
$backupPath = ''
if ($keepFlag -and (Test-Path $DataDir)) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmm'
    if ($BackupTo) { $backupPath = $BackupTo } else { $backupPath = Join-Path $desktop ("林知夏-聊天记录-$stamp") }
    try {
        New-Item -ItemType Directory -Force -Path $backupPath | Out-Null
        Copy-Item (Join-Path $DataDir '*') $backupPath -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host ('  ✓ 聊天记录已备份到：' + $backupPath)
    } catch {
        Write-Host ('  ! 备份失败：' + $_.Exception.Message) -ForegroundColor Yellow
        Write-Host '    为了不丢记录，已中止卸载（什么都没删）。' -ForegroundColor Yellow
        if (-not $Yes) { Read-Host '按回车关闭' }
        exit 1
    }
}

# ---------- 删快捷方式 ----------
$removed = 0
foreach ($name in $SHORTCUTS) {
    $p = Join-Path $desktop $name
    if (Test-Path $p) {
        try {
            Remove-Item $p -Force
            $removed++
        } catch { }
    }
}
Write-Host ("  ✓ 已删除 $removed 个桌面快捷方式")

# ---------- 删安装目录（临时脚本，避免删自己失败）----------
$cleanup = Join-Path $env:TEMP ('lzx-uninstall-' + [guid]::NewGuid().ToString('N').Substring(0, 8) + '.ps1')
$lines = @(
    'Start-Sleep -Seconds 2',
    ('$target = ' + "'" + $Root + "'"),
    'for ($i = 0; $i -lt 12; $i++) {',
    '    try {',
    '        Remove-Item -Path $target -Recurse -Force -ErrorAction Stop',
    '        break',
    '    } catch { Start-Sleep -Milliseconds 500 }',
    '}',
    'if (Test-Path $target) {',
    '    Get-ChildItem $target -Recurse -Force -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | ForEach-Object {',
    '        Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue',
    '    }',
    '    Remove-Item $target -Recurse -Force -ErrorAction SilentlyContinue',
    '}',
    'Remove-Item $PSCommandPath -Force -ErrorAction SilentlyContinue'
)
[IO.File]::WriteAllLines($cleanup, $lines, (New-Object Text.UTF8Encoding $true))

Write-Host '  · 正在删除安装目录…'
Start-Process -FilePath 'powershell' -ArgumentList ('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $cleanup + '"') -WindowStyle Hidden | Out-Null

for ($i = 0; $i -lt 20; $i++) {
    if (-not (Test-Path $Root)) { break }
    Start-Sleep -Milliseconds 700
}

Write-Host ''
if (Test-Path $Root) {
    Write-Host '  目录没有完全删掉（可能有文件被占用）。' -ForegroundColor Yellow
    Write-Host ('  请重启电脑后手动删除：' + $Root) -ForegroundColor Yellow
} else {
    Write-Host '  卸载完成。' -ForegroundColor Green
}
if ($backupPath) {
    Write-Host ('  聊天记录在：' + $backupPath) -ForegroundColor Cyan
    Write-Host '  （想恢复：重装后把这些文件放进 app\data）' -ForegroundColor DarkGray
}
Write-Host ''
if (-not $Yes) { Read-Host '按回车关闭' }
