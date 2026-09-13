$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add('http://localhost:8000/')
$listener.Start()
$chromePaths = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$chrome = $chromePaths | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($chrome) { Start-Process $chrome 'http://localhost:8000/index.html' }
else { Start-Process 'http://localhost:8000/index.html' }
Write-Host 'Cuy Dorado abierto en http://localhost:8000/index.html'
Write-Host 'Cierra esta ventana para detener el servidor.'

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $relativePath = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart('/'))
    if ([string]::IsNullOrWhiteSpace($relativePath)) { $relativePath = 'index.html' }
    $filePath = [IO.Path]::GetFullPath((Join-Path $root $relativePath))
    $rootPath = [IO.Path]::GetFullPath($root)
    if (-not $filePath.StartsWith($rootPath, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path $filePath -PathType Leaf)) {
      $context.Response.StatusCode = 404
      $context.Response.Close()
      continue
    }
    $contentTypes = @{
      '.html' = 'text/html; charset=utf-8'
      '.css' = 'text/css; charset=utf-8'
      '.js' = 'application/javascript; charset=utf-8'
      '.png' = 'image/png'
      '.jpg' = 'image/jpeg'
      '.jpeg' = 'image/jpeg'
      '.webp' = 'image/webp'
    }
    $extension = [IO.Path]::GetExtension($filePath).ToLowerInvariant()
    $context.Response.ContentType = if ($contentTypes.ContainsKey($extension)) { $contentTypes[$extension] } else { 'application/octet-stream' }
    $bytes = [IO.File]::ReadAllBytes($filePath)
    $context.Response.ContentLength64 = $bytes.Length
    $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $context.Response.Close()
  }
} finally {
  $listener.Stop()
  $listener.Close()
}
