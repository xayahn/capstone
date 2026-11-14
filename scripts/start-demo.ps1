param(
  [switch]$ResetDemo,
  [switch]$CheckOnly,
  [int]$Port = 3000,
  [string]$LanIp = ''
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$adminDir = Join-Path $repoRoot 'apps\admin'
$mobileDir = Join-Path $repoRoot 'apps\mobile'
$mobileEnvPath = Join-Path $mobileDir '.env'
$mobileEnvExamplePath = Join-Path $mobileDir '.env.example'

function Resolve-ActiveLanIPv4 {
  param([string]$Override)
  if ($Override -and $Override.Trim().Length -gt 0) {
    return $Override.Trim()
  }

  $virtualPattern = 'vEthernet|WSL|Loopback|Docker|VMware|VirtualBox|Hyper-V|Tailscale|ZeroTier'

  try {
    $defaultRoutes = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction Stop |
      Where-Object { $_.NextHop -and $_.NextHop -ne '0.0.0.0' } |
      Sort-Object -Property RouteMetric, InterfaceMetric

    foreach ($route in $defaultRoutes) {
      $ipObj = Get-NetIPAddress -InterfaceIndex $route.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
          $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and
          $_.InterfaceAlias -notmatch $virtualPattern
        } |
        Select-Object -First 1
      if ($ipObj) {
        return $ipObj.IPAddress
      }
    }
  } catch {
    # Fallback below when NetTCPIP cmdlets are restricted.
  }

  try {
    $fallback = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
      Where-Object {
        $_.IPAddress -match '^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)' -and
        $_.InterfaceAlias -notmatch $virtualPattern
      } |
      Select-Object -First 1
    if ($fallback) {
      return $fallback.IPAddress
    }
  } catch {
    # Fallback to .NET DNS host addresses.
  }

  $dnsIp = [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) |
    Where-Object {
      $_.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and
      $_.IPAddressToString -match '^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)'
    } |
    Select-Object -First 1

  if ($dnsIp) {
    return $dnsIp.IPAddressToString
  }

  return '127.0.0.1'
}

function Set-EnvKeyValue {
  param(
    [string[]]$Lines,
    [string]$Key,
    [string]$Value
  )
  $updated = $false
  $output = foreach ($line in $Lines) {
    if ($line -match "^\s*$([regex]::Escape($Key))\s*=") {
      $updated = $true
      "$Key=$Value"
    } else {
      $line
    }
  }
  if (-not $updated) {
    $output = @($output) + "$Key=$Value"
  }
  return ,$output
}

$detectedIp = Resolve-ActiveLanIPv4 -Override $LanIp
$apiBaseUrl = "http://${detectedIp}:${Port}/api"

if (-not (Test-Path -LiteralPath $mobileEnvPath)) {
  if (Test-Path -LiteralPath $mobileEnvExamplePath) {
    Copy-Item -LiteralPath $mobileEnvExamplePath -Destination $mobileEnvPath
  } else {
    Set-Content -LiteralPath $mobileEnvPath -Value @() -Encoding UTF8
  }
}

$envLines = @(Get-Content -LiteralPath $mobileEnvPath)
$envLines = Set-EnvKeyValue -Lines $envLines -Key 'EXPO_PUBLIC_APP_ENV' -Value 'development'
$envLines = Set-EnvKeyValue -Lines $envLines -Key 'EXPO_PUBLIC_DEMO_MODE' -Value 'false'
$envLines = Set-EnvKeyValue -Lines $envLines -Key 'EXPO_PUBLIC_API_BASE_URL' -Value $apiBaseUrl
[System.IO.File]::WriteAllLines($mobileEnvPath, $envLines, (New-Object System.Text.UTF8Encoding($false)))

$adminRunning = $false
try {
  $probe = Invoke-WebRequest -Uri "http://127.0.0.1:${Port}/api/mobile/catalog" -Method GET -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
  if ($probe.StatusCode -ge 200 -and $probe.StatusCode -lt 500) {
    $adminRunning = $true
  }
} catch {
  $adminRunning = $false
}

if ($ResetDemo) {
  if ($adminRunning) {
    Write-Warning "Port $Port is currently running. Stop the existing admin server first before using -ResetDemo."
    exit 1
  }
  Write-Host "Resetting local development D1 database and R2 storage..." -ForegroundColor Cyan
  node (Join-Path $adminDir 'scripts\demo-reset.mjs')
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Yellow
Write-Host " ParishLink Defense & Live LAN Demonstration Launcher" -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Yellow
Write-Host " Detected LAN IPv4 : $detectedIp"
Write-Host " Admin Web Portal  : http://localhost:$Port   (open this in laptop browser)"
Write-Host " Mobile API Origin : $apiBaseUrl"
Write-Host " Updated Mobile Env: $mobileEnvPath"
Write-Host "------------------------------------------------------------"
Write-Host " Seeded Local Accounts (Password for all: ParishLink2026!)" -ForegroundColor Green
Write-Host "   System Admin    : admin@parishlink.test"
Write-Host "   Cathedral Staff : staff.cathedral@parishlink.test"
Write-Host "   Cathedral Priest: dizon@example.test"
Write-Host "   Parishioner App : liza.gomez@example.test"
Write-Host "============================================================" -ForegroundColor Yellow
Write-Host ""

if ($CheckOnly) {
  Write-Host "CheckOnly complete. Environment updated and verified." -ForegroundColor Green
  exit 0
}

if (-not $adminRunning) {
  Write-Host "Starting ParishLink Admin & API server on port $Port in a new window..." -ForegroundColor Cyan
  $adminCmd = "Set-Location -LiteralPath '$adminDir'; pnpm --pm-on-fail=ignore run dev"
  Start-Process powershell -ArgumentList @('-NoExit', '-Command', $adminCmd) | Out-Null

  Write-Host "Waiting for Admin & API server to accept connections..." -NoNewline
  $ready = $false
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    Write-Host "." -NoNewline
    try {
      $resp = Invoke-WebRequest -Uri "http://127.0.0.1:${Port}/api/mobile/catalog" -Method GET -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
      if ($resp.StatusCode -eq 200) {
        $ready = $true
        break
      }
    } catch {
      # Keep waiting while Vinext compiles initial bundle.
    }
  }
  Write-Host ""
  if ($ready) {
    Write-Host "Admin & API server is live at http://localhost:$Port" -ForegroundColor Green
  } else {
    Write-Warning "Admin server is still starting up in the other window; continuing to start Expo..."
  }
} else {
  Write-Host "Admin & API server is already running on port $Port." -ForegroundColor Green
}

Write-Host "Starting ParishLink Mobile (Expo Go LAN)..." -ForegroundColor Cyan
Set-Location -LiteralPath $mobileDir
pnpm --pm-on-fail=ignore run dev -- --lan
