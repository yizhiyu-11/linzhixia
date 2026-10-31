# ============================================================
# Run this ON THE CLOUD SERVER (PowerShell as Administrator).
# Starts a temporary HTTP receiver so the home machine can
# upload files with one command.
#
#   .\cloud-receive.ps1
#   .\cloud-receive.ps1 -Port 8899 -SaveDir D:\deploy
#
# Needs Administrator for http://+:<port>/ ; without admin it
# falls back to http://localhost:<port>/ (local test only).
# Stop with Ctrl+C, then close the port in the security group.
# ASCII only on purpose.
# ============================================================
param(
    [int]$Port = 8899,
    [string]$SaveDir = 'D:\deploy'
)

$ErrorActionPreference = 'Stop'

New-Item -ItemType Directory -Force -Path $SaveDir | Out-Null

# 1) allow through Windows firewall (the cloud security group is a separate gate)
$ruleName = "TempUpload-$Port"
try {
    if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow | Out-Null
        Write-Host "firewall rule added: $ruleName" -ForegroundColor DarkGray
    }
} catch {
    Write-Host "could not add firewall rule (not admin?): $($_.Exception.Message)" -ForegroundColor Yellow
}

# 2) start listener: try all interfaces, fall back to localhost
$listener = New-Object System.Net.HttpListener
$prefix = "http://+:$Port/"
$listener.Prefixes.Add($prefix)
$scope = 'all-interfaces (reachable from the internet if the security group allows it)'
try {
    $listener.Start()
} catch {
    Write-Host ''
    Write-Host "cannot listen on $prefix" -ForegroundColor Yellow
    Write-Host "  reason: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host '  -> not running as Administrator. Falling back to localhost only.' -ForegroundColor Yellow
    Write-Host '  -> for a real upload from home, restart this script as Administrator.' -ForegroundColor Yellow
    $listener = New-Object System.Net.HttpListener
    $prefix = "http://127.0.0.1:$Port/"
    $listener.Prefixes.Add($prefix)
    $listener.Prefixes.Add("http://localhost:$Port/")
    $listener.Start()
    $scope = 'loopback only (NOT reachable from home - run as admin for that)'
}

Write-Host ''
Write-Host '=== READY ===' -ForegroundColor Green
Write-Host "  listening: $prefix"
Write-Host "  scope:     $scope"
Write-Host "  saving to: $SaveDir"
Write-Host "  from home: Invoke-WebRequest -Method Put -Uri http://<public-ip>:$Port/<name> -InFile <path>"
Write-Host '  Ctrl+C when done, then remove the security group rule'
Write-Host ''

try {
    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        $req = $ctx.Request
        $name = [IO.Path]::GetFileName($req.Url.AbsolutePath.TrimStart('/'))
        if ([string]::IsNullOrWhiteSpace($name)) { $name = 'upload-' + (Get-Date -Format 'HHmmss') + '.bin' }

        $dest = Join-Path $SaveDir $name
        $fs = [IO.File]::Open($dest, [IO.FileMode]::Create, [IO.FileAccess]::Write)
        try {
            $req.InputStream.CopyTo($fs)
        } finally {
            $fs.Close()
        }

        $len = (Get-Item $dest).Length
        $sha = (Get-FileHash $dest -Algorithm SHA256).Hash
        Write-Host ("  received {0}  {1:N0} bytes  {2}" -f $name, $len, $sha.Substring(0, 16)) -ForegroundColor Cyan

        $body = [Text.Encoding]::UTF8.GetBytes("OK $name $len $sha")
        $ctx.Response.StatusCode = 200
        $ctx.Response.ContentType = 'text/plain'
        $ctx.Response.OutputStream.Write($body, 0, $body.Length)
        $ctx.Response.Close()
    }
} finally {
    $listener.Stop()
    $listener.Close()
    Write-Host ''
    Write-Host 'listener stopped.' -ForegroundColor Yellow
    Write-Host "remember: remove the inbound rule for TCP $Port in the security group" -ForegroundColor Yellow
}
