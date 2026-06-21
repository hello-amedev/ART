# 配布 zip(日本語版 / 英語版)を生成するスクリプト。
#
# 使い方:
#   build-dist.bat をダブルクリック(推奨)
#   または PowerShell で:
#     powershell -ExecutionPolicy Bypass -File build-dist.ps1
#
# 出力:
#   dist/night-of-life-vX.Y.Z-ja.zip   (BOOTH 用)
#   dist/night-of-life-vX.Y.Z-en.zip   (GUMROAD 用)
#
# zip 解凍後は night-of-life-vX.Y.Z-ja/ フォルダができ、その中に
# index.html / LivelyProperties.json / js/ / README.txt が入る。

$ErrorActionPreference = 'Stop'

# スクリプトのある場所をカレントにする(.bat 経由でも単独実行でも安定)
Set-Location -Path $PSScriptRoot

$Version = 'v2.0.0'
$Src = 'night-of-life'
$Dist = 'dist'

# 共通で同梱するファイル / ディレクトリ
$Common = @('index.html', 'js')

function Build-Lang {
    param(
        [string]$Lang,        # ja / en
        [string]$Readme,      # README.txt / README.en.txt
        [string]$Lp           # LivelyProperties.json / LivelyProperties.en.json
    )
    $outname = "night-of-life-$Version-$Lang"
    $stage = Join-Path $Dist $outname

    # 前回失敗で残った場合に備えて毎回クリーン作成
    if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
    New-Item -ItemType Directory -Path $stage -Force | Out-Null

    # 共通ファイルをコピー(js/ はフォルダごと)
    foreach ($f in $Common) {
        Copy-Item -Path (Join-Path $Src $f) -Destination $stage -Recurse
    }

    # README は配布版では常に「README.txt」として同梱
    Copy-Item -Path (Join-Path $Src $Readme) -Destination (Join-Path $stage 'README.txt')

    # LP は配布版では常に「LivelyProperties.json」として同梱
    Copy-Item -Path (Join-Path $Src $Lp) -Destination (Join-Path $stage 'LivelyProperties.json')

    # zip 化(フォルダごと圧縮するので解凍後にフォルダができる)
    $zipPath = Join-Path $Dist "$outname.zip"
    if (Test-Path $zipPath) { Remove-Item $zipPath }
    Compress-Archive -Path $stage -DestinationPath $zipPath -CompressionLevel Optimal

    # ステージは削除(zip だけ残す)
    Remove-Item -Recurse -Force $stage

    Write-Host "  built: $zipPath"
}

# 旧 dist を一掃して作り直す(削除エラーは無視して後続で再作成)
if (Test-Path $Dist) {
    Remove-Item -Recurse -Force $Dist -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Path $Dist -Force | Out-Null

Write-Host "Building distribution zips for $Version..."
Build-Lang -Lang 'ja' -Readme 'README.txt'    -Lp 'LivelyProperties.json'
Build-Lang -Lang 'en' -Readme 'README.en.txt' -Lp 'LivelyProperties.en.json'

Write-Host ""
Write-Host "Done."
Get-ChildItem $Dist | Format-Table Name, Length, LastWriteTime -AutoSize
