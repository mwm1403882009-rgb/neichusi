param([string]$ToolsPath='', [string]$OutputName='')
$ErrorActionPreference='Stop'
$appRoot=Split-Path $PSScriptRoot -Parent
$appVersion=(Get-Content (Join-Path $appRoot 'package.json') -Raw | ConvertFrom-Json).version
if (!$OutputName) { $OutputName='neichusi-android-'+$appVersion+'.apk' }
if (!$ToolsPath) { $ToolsPath=Join-Path $appRoot '.tools' }
$javaBin=Join-Path $ToolsPath 'jdk/bin'
$sdkBuild=Join-Path $ToolsPath 'build-tools'
$androidJar=Join-Path $ToolsPath 'platform/android.jar'
$buildRoot=Join-Path $appRoot 'build'
$classes=Join-Path $buildRoot 'classes'
$dex=Join-Path $buildRoot 'dex'
$signing=Join-Path $appRoot 'signing'
$output=Join-Path $appRoot 'dist'
foreach($directory in @($buildRoot,$classes,$dex,$signing,$output)){New-Item -ItemType Directory -Path $directory -Force | Out-Null}
function Check-Exit($step){if($LASTEXITCODE -ne 0){throw "$step failed ($LASTEXITCODE)"}}
Push-Location $appRoot
try {
  & node scripts/build-web.mjs
  Check-Exit 'Client build'
  & (Join-Path $sdkBuild 'aapt2.exe') compile --dir native/res -o build/resources.zip
  Check-Exit 'Resource compile'
  $relativeAndroidJar=[System.IO.Path]::GetRelativePath($appRoot,$androidJar)
  & (Join-Path $sdkBuild 'aapt2.exe') link -o build/unsigned.apk -I $relativeAndroidJar --manifest native/AndroidManifest.xml -A dist/web build/resources.zip
  Check-Exit 'Resource link'
  $sources=Get-ChildItem (Join-Path $appRoot 'native/src') -Filter '*.java' -Recurse | ForEach-Object {$_.FullName}
  & (Join-Path $javaBin 'javac.exe') -encoding UTF-8 --release 8 -cp $androidJar -d $classes $sources
  Check-Exit 'Java compile'
  & (Join-Path $javaBin 'jar.exe') cf (Join-Path $buildRoot 'classes.jar') -C $classes .
  Check-Exit 'Classes archive'
  & (Join-Path $javaBin 'java.exe') -cp (Join-Path $sdkBuild 'lib/d8.jar') com.android.tools.r8.D8 --release --min-api 26 --lib $androidJar --output $dex (Join-Path $buildRoot 'classes.jar')
  Check-Exit 'Dex compile'
  Push-Location $dex
  try { & (Join-Path $javaBin 'jar.exe') uf (Join-Path $buildRoot 'unsigned.apk') classes.dex; Check-Exit 'Dex package' } finally { Pop-Location }
  & (Join-Path $sdkBuild 'zipalign.exe') -f -p 4 build/unsigned.apk build/aligned.apk
  Check-Exit 'APK alignment'
  $keystore=Join-Path $signing 'neichusi-release.jks'
  $passwordFile=Join-Path $signing 'password.txt'
  if (!(Test-Path $keystore)) {
    if(Test-Path $passwordFile){throw 'Signing password exists but keystore is missing. Restore the signing backup before building an update.'}
    $signingPassword=([guid]::NewGuid().ToString('N')+[guid]::NewGuid().ToString('N'))
    [System.IO.File]::WriteAllText($passwordFile,$signingPassword)
    & (Join-Path $javaBin 'keytool.exe') -genkeypair -keystore $keystore -storetype JKS -alias neichusi -keyalg RSA -keysize 3072 -validity 10000 -storepass $signingPassword -keypass $signingPassword -dname 'CN=Neichusi Android, OU=Independent, O=Neichusi, C=CN' -noprompt
    Check-Exit 'Release signing key'
  }
  if (!(Test-Path $passwordFile)){throw 'Signing password missing; restore the signing backup.'}
  $signingPassword=[System.IO.File]::ReadAllText($passwordFile).Trim()
  $previousPassword=$env:NEICHUSI_BUILD_SIGNING_PASSWORD
  try {
    $env:NEICHUSI_BUILD_SIGNING_PASSWORD=$signingPassword
    & (Join-Path $javaBin 'java.exe') -jar (Join-Path $sdkBuild 'lib/apksigner.jar') sign --ks $keystore --ks-key-alias neichusi --ks-pass env:NEICHUSI_BUILD_SIGNING_PASSWORD --key-pass env:NEICHUSI_BUILD_SIGNING_PASSWORD --out (Join-Path $output $OutputName) (Join-Path $buildRoot 'aligned.apk')
    Check-Exit 'APK signing'
  } finally { $env:NEICHUSI_BUILD_SIGNING_PASSWORD=$previousPassword }
  & (Join-Path $javaBin 'java.exe') -jar (Join-Path $sdkBuild 'lib/apksigner.jar') verify --verbose --print-certs (Join-Path $output $OutputName)
  Check-Exit 'Signature verification'
  & (Join-Path $sdkBuild 'aapt.exe') dump badging ('dist/'+$OutputName)
  Check-Exit 'Manifest inspection'
  Get-FileHash -LiteralPath (Join-Path $output $OutputName) -Algorithm SHA256
} finally { Pop-Location }
