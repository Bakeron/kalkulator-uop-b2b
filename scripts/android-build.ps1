# Builds the Android debug APK on Windows. Usage: powershell -File scripts/android-build.ps1 [-Target aarch64|x86_64] [-Init]
# -Init only creates src-tauri/gen/android (once). Paths: JDK 21 (Temurin), Android SDK and NDK in %LOCALAPPDATA%.
param([string]$Target = "aarch64", [switch]$Init)
$env:JAVA_HOME = "$env:LOCALAPPDATA\Programs\temurin-21\jdk-21.0.13+9"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:NDK_HOME = "$env:ANDROID_HOME\ndk\30.0.16248370"
$env:ANDROID_NDK_ROOT = $env:NDK_HOME
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"
# ring (TLS on the phone) compiles C code - the NDK's clang with the Android API level in the target.
$bin = "$($env:NDK_HOME -replace '\\','/')/toolchains/llvm/prebuilt/windows-x86_64/bin"
$triple = @{ aarch64 = "aarch64-linux-android"; x86_64 = "x86_64-linux-android" }[$Target]
Set-Item "env:CC_$triple" "$bin/clang.exe"
Set-Item "env:AR_$triple" "$bin/llvm-ar.exe"
Set-Item "env:RANLIB_$triple" "$bin/llvm-ranlib.exe"
Set-Item "env:CFLAGS_$triple" "--target=${triple}24"
# Gradle's own downloads (wrapper, Maven) trust the Windows certificate store, not only Java's.
$env:JAVA_OPTS = "-Djavax.net.ssl.trustStoreType=Windows-ROOT"
$env:GRADLE_OPTS = $env:JAVA_OPTS
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
if ($Init) {
    npx tauri android init --ci 2>&1 | ForEach-Object { "$_" }
    "exit=$LASTEXITCODE"
    return
}
# Install number: every build is 0.1 higher (1.0, 1.1, ...). The last built number lives in
# scripts/numer-instalki.txt and is saved only after a successful build. It becomes the Android
# versionName (and versionCode, so the phone accepts the update) and the APK file name.
$numberFile = Join-Path $PSScriptRoot "numer-instalki.txt"
if (Test-Path $numberFile) {
    $last = (Get-Content $numberFile -Raw).Trim()
    if ($last -notmatch '^\d+\.\d$') { throw "Bad scripts/numer-instalki.txt - expected e.g. 1.0" }
    $tenths = [int]($last -replace '\.', '') + 1
    $number = "$([math]::Floor($tenths / 10)).$($tenths % 10)"
} else { $number = "1.0" }
$versionConfig = "$root\src-tauri\target\android-version.json"
New-Item -ItemType Directory -Force (Split-Path $versionConfig) | Out-Null
[IO.File]::WriteAllText($versionConfig, "{ `"version`": `"$number.0`" }")
"Install number: $number"
$log = npx tauri android build --debug --target $Target --apk --config $versionConfig 2>&1 | ForEach-Object { "$_" }
$log
$code = $LASTEXITCODE
# Without Windows Developer Mode the CLI cannot symlink the .so into jniLibs. The library is
# already built at that point, so copy it and run Gradle directly, skipping the Rust task
# (it would call the CLI again and fail on the same symlink).
if ($code -ne 0 -and ($log -match "symbolic link")) {
    $abi = @{ aarch64 = "arm64-v8a"; x86_64 = "x86_64" }[$Target]
    $flavor = @{ aarch64 = "Arm64"; x86_64 = "X86_64" }[$Target]
    $android = "$root\src-tauri\gen\android"
    New-Item -ItemType Directory -Force "$android\app\src\main\jniLibs\$abi" | Out-Null
    Copy-Item "$root\src-tauri\target\$triple\debug\libkalkulator_uop_b2b_lib.so" "$android\app\src\main\jniLibs\$abi\" -Force
    Set-Location $android
    "Symlink not allowed - copied the library, running Gradle directly"
    .\gradlew.bat "assemble${flavor}Debug" -x "rustBuild${flavor}Debug" --console=plain 2>&1 | ForEach-Object { "$_" }
    $code = $LASTEXITCODE
}
if ($code -eq 0) {
    $apkAbi = @{ aarch64 = "arm64"; x86_64 = "x86_64" }[$Target]
    New-Item -ItemType Directory -Force "$root\apk" | Out-Null
    Copy-Item "$root\src-tauri\gen\android\app\build\outputs\apk\$apkAbi\debug\app-$apkAbi-debug.apk" "$root\apk\KalkulatorUopB2B-$number.apk" -Force
    [IO.File]::WriteAllText($numberFile, "$number`n")
    "APK: apk\KalkulatorUopB2B-$number.apk"
}
"exit=$code"
