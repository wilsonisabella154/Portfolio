# Local preview server: powershell -ExecutionPolicy Bypass -File serve.ps1
$root = [IO.Path]::GetFullPath($PSScriptRoot)
$types = @{
  ".html" = "text/html; charset=utf-8"
  ".css" = "text/css"
  ".js" = "application/javascript"
  ".svg" = "image/svg+xml"
  ".png" = "image/png"
  ".jpg" = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".webp" = "image/webp"
  ".pdf" = "application/pdf"
  ".mp4" = "video/mp4"
  ".mov" = "video/quicktime"
  ".webm" = "video/webm"
}

$listener = $null
$port = $null
foreach ($try in 5174, 5175, 5176) {
  try {
    $candidate = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $try)
    $candidate.Start()
    $listener = $candidate
    $port = $try
    break
  } catch {
    if ($candidate) { try { $candidate.Stop() } catch {} }
  }
}
if (-not $listener) { throw "Could not start preview server on 5174-5176" }
Write-Host "Serving $root at http://127.0.0.1:$port (Ctrl+C to stop)"

function Read-Request($client) {
  $stream = $client.GetStream()
  $stream.ReadTimeout = 5000
  $buffer = New-Object byte[] 4096
  $text = ""
  while ($text -notmatch "`r`n`r`n") {
    $n = $stream.Read($buffer, 0, $buffer.Length)
    if ($n -le 0) { break }
    $text += [Text.Encoding]::ASCII.GetString($buffer, 0, $n)
  }
  return @{ Stream = $stream; Text = $text }
}

function Write-Headers($stream, $status, $headers) {
  $lines = New-Object System.Collections.Generic.List[string]
  [void]$lines.Add("HTTP/1.1 $status")
  foreach ($key in $headers.Keys) { [void]$lines.Add("$key`: $($headers[$key])") }
  [void]$lines.Add("")
  $bytes = [Text.Encoding]::ASCII.GetBytes(($lines -join "`r`n") + "`r`n")
  $stream.Write($bytes, 0, $bytes.Length)
}

function Send-File($stream, $file, $contentType, $rangeHeader) {
  $length = ([IO.FileInfo]$file).Length
  $start = [int64]0
  $end = $length - 1
  $status = "200 OK"
  if ($rangeHeader -and $rangeHeader -match 'bytes=(\d*)-(\d*)') {
    if ($Matches[1] -ne "") { $start = [int64]$Matches[1] }
    if ($Matches[2] -ne "") { $end = [int64]$Matches[2] }
    if ($end -ge $length) { $end = $length - 1 }
    $status = "206 Partial Content"
  }
  $count = $end - $start + 1
  $isMedia = $contentType.StartsWith("image/") -or $contentType.StartsWith("video/") -or $contentType -eq "application/pdf"
  $headers = @{
    "Content-Type" = $contentType
    "Content-Length" = "$count"
    "Accept-Ranges" = "bytes"
    "Cache-Control" = $(if ($isMedia) { "public, max-age=86400" } else { "no-cache" })
    "Connection" = "close"
  }
  if ($status.StartsWith("206")) { $headers["Content-Range"] = "bytes $start-$end/$length" }
  Write-Headers $stream $status $headers
  $fileStream = [IO.File]::OpenRead($file)
  try {
    [void]$fileStream.Seek($start, "Begin")
    $buffer = New-Object byte[] 65536
    $left = $count
    while ($left -gt 0) {
      $n = $fileStream.Read($buffer, 0, [Math]::Min($buffer.Length, $left))
      if ($n -le 0) { break }
      $stream.Write($buffer, 0, $n)
      $left -= $n
    }
  } finally {
    $fileStream.Dispose()
  }
}

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $req = Read-Request $client
      $stream = $req.Stream
      if (-not $req.Text) { continue }
      $first = ($req.Text -split "`r`n")[0]
      if ($first -notmatch '^(GET|HEAD) (\S+)') {
        Write-Headers $stream "405 Method Not Allowed" @{ "Connection" = "close"; "Content-Length" = "0" }
        continue
      }
      $rawPath = $Matches[2]
      if ($rawPath.Contains("?")) { $rawPath = $rawPath.Split("?")[0] }
      $path = [Uri]::UnescapeDataString($rawPath.TrimStart("/"))
      if ($path -eq "") { $path = "index.html" }
      $file = [IO.Path]::GetFullPath((Join-Path $root $path))
      if ($file.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path $file -PathType Leaf)) {
        $ext = [IO.Path]::GetExtension($file).ToLowerInvariant()
        $type = $(if ($types[$ext]) { $types[$ext] } else { "application/octet-stream" })
        $range = if ($req.Text -match '(?im)^Range:\s*(.+)$') { $Matches[1].Trim() } else { $null }
        Send-File $stream $file $type $range
      } else {
        Write-Headers $stream "404 Not Found" @{ "Connection" = "close"; "Content-Length" = "0" }
      }
    } catch {
      # drop the connection
    } finally {
      $client.Close()
    }
  }
} finally {
  $listener.Stop()
}
