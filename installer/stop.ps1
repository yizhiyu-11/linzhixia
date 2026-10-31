# 停止林知夏本地版
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$App = $Root.TrimEnd('\')
$killed = 0
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ForEach-Object {
    if ($_.CommandLine -and $_.CommandLine -match 'index\.mjs' -and $_.CommandLine -like "*$App*") {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        Write-Host ("  已停止 PID " + $_.ProcessId)
        $killed++
    }
}
if ($killed -eq 0) { Write-Host '  没有在运行' }