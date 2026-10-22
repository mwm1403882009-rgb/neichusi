$ErrorActionPreference = 'Stop'
$toolRoot = Join-Path (Split-Path $PSScriptRoot -Parent) '.tools'
New-Item -ItemType Directory -Path $toolRoot -Force | Out-Null
$ProgressPreference = 'SilentlyContinue'
function Fetch-Archive($url, $name, $hash, $algorithm) {
  $target = Join-Path $toolRoot $name
  if (!(Test-Path $target) -or (Get-FileHash -LiteralPath $target -Algorithm $algorithm).Hash.ToLower() -ne $hash.ToLower()) {
    Write-Host "Downloading $name"
    Invoke-WebRequest -Uri $url -OutFile $target -TimeoutSec 900
  }
  if ((Get-FileHash -LiteralPath $target -Algorithm $algorithm).Hash.ToLower() -ne $hash.ToLower()) { throw "Checksum mismatch: $name" }
  return $target
}
if (!(Test-Path (Join-Path $toolRoot 'jdk'))) {
  $assets = Invoke-RestMethod 'https://api.adoptium.net/v3/assets/latest/17/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse' -TimeoutSec 60
  $package = $assets[0].binary.package
  $archive = Fetch-Archive $package.link 'jdk.zip' $package.checksum 'SHA256'
  Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $toolRoot 'java-unpacked') -Force
  $jdkDirectory = Get-ChildItem (Join-Path $toolRoot 'java-unpacked') -Directory | Select-Object -First 1
  Move-Item -LiteralPath $jdkDirectory.FullName -Destination (Join-Path $toolRoot 'jdk')
}
[xml]$repository = (Invoke-WebRequest 'https://dl.google.com/android/repository/repository2-1.xml' -TimeoutSec 60).Content
foreach ($selection in @(@{package='platforms;android-35';destination='platform';revision='2'}, @{package='build-tools;35.0.0';destination='build-tools';revision='35'})) {
  $destination = Join-Path $toolRoot $selection.destination
  if (Test-Path $destination) { continue }
  $package = $repository.DocumentElement.remotePackage | Where-Object { $_.path -eq $selection.package -and [string]$_.revision.major -eq $selection.revision } | Select-Object -First 1
  if (!$package) { throw "Official SDK package missing: $($selection.package)" }
  $archiveInfo = $package.archives.archive | Where-Object { $_.'host-os' -eq 'windows' -or -not $_.'host-os' } | Select-Object -First 1
  $complete = $archiveInfo.complete
  $checksum = $complete.checksum.InnerText
  if (!$checksum) { $checksum = [string]$complete.checksum }
  $archive = Fetch-Archive ('https://dl.google.com/android/repository/' + [string]$complete.url) ($selection.destination+'.zip') $checksum 'SHA1'
  $unpacked = Join-Path $toolRoot ($selection.destination+'-unpacked')
  Expand-Archive -LiteralPath $archive -DestinationPath $unpacked -Force
  $inner = Get-ChildItem $unpacked -Directory | Select-Object -First 1
  Move-Item -LiteralPath $inner.FullName -Destination $destination
}
Write-Output "Build tools ready: $toolRoot"
