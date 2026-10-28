# If Node.js is available, start the full-stack server (SQLite + SLA scheduler + AI services)
$nodePath = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $nodePath) {
    $wingetNode = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.20.0-win-x64\node.exe"
    if (Test-Path $wingetNode) {
        $nodePath = $wingetNode
    }
}

if ($nodePath) {
    Write-Host "=================================================" -ForegroundColor Cyan
    Write-Host " 🛡️ Starting AICTE FlowGuard Full-Stack Server... " -ForegroundColor Green
    Write-Host " Node: $nodePath" -ForegroundColor DarkGray
    Write-Host "=================================================" -ForegroundColor Cyan
    & $nodePath server.js
    exit
}

$port = 5500
$listener = New-Object System.Net.HttpListener
$prefix = "http://localhost:$port/"
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
    Write-Host "=================================================" -ForegroundColor Cyan
    Write-Host " AICTE FlowGuard Local Server Running!           " -ForegroundColor Green
    Write-Host " URL: $prefix" -ForegroundColor Yellow
    Write-Host " Press Ctrl+C in this terminal to stop server.   " -ForegroundColor Cyan
    Write-Host "=================================================" -ForegroundColor Cyan

    Start-Process $prefix

    $currentDir = Get-Location

    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $urlPath = $request.Url.LocalPath.TrimStart('/')
        if ([string]::IsNullOrEmpty($urlPath)) {
            $urlPath = "index.html"
        }

        $filePath = Join-Path $currentDir $urlPath

        if (Test-Path $filePath -PathType Leaf) {
            $content = [System.IO.File]::ReadAllBytes($filePath)
            
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $contentType = switch ($ext) {
                ".html" { "text/html; charset=utf-8" }
                ".css"  { "text/css; charset=utf-8" }
                ".js"   { "application/javascript; charset=utf-8" }
                ".json" { "application/json; charset=utf-8" }
                ".png"  { "image/png" }
                ".svg"  { "image/svg+xml" }
                ".ico"  { "image/x-icon" }
                Default { "application/octet-stream" }
            }

            $response.ContentType = $contentType
            $response.ContentLength64 = $content.Length
            $response.OutputStream.Write($content, 0, $content.Length)
        } else {
            $response.StatusCode = 404
            $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $response.OutputStream.Write($msg, 0, $msg.Length)
        }
        $response.Close()
    }
} catch {
    Write-Host "Server stopped or error occurred: $_" -ForegroundColor Red
} finally {
    $listener.Stop()
    $listener.Close()
}
