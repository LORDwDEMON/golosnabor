# ПРОВЕРИТЬ_ДВИЖОК.ps1
# Сверка файлов движка распознавания с описью engine\СОСТАВ_ДВИЖКА.json:
# наличие, размер и SHA-256. Ничего не меняет, только читает.
#
# Запуск:  powershell -NoProfile -ExecutionPolicy Bypass -File ПРОВЕРИТЬ_ДВИЖОК.ps1
# Код возврата: 0 — всё на месте и совпадает; 1 — есть недостающие или испорченные файлы.

param(
    [string]$Kit = (Split-Path -Parent $MyInvocation.MyCommand.Path)
)

$ErrorActionPreference = 'Stop'
$engineDir = Join-Path $Kit 'engine'
$manifestPath = Join-Path $engineDir 'СОСТАВ_ДВИЖКА.json'

Write-Output 'ГолосНабор: проверка движка распознавания'
Write-Output '=========================================='

if (-not (Test-Path -LiteralPath $manifestPath)) {
    Write-Output "ОШИБКА: нет описи $manifestPath"
    exit 1
}

$manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $manifestPath | ConvertFrom-Json
Write-Output ("опись от {0}: файлов {1}, всего {2:N1} МБ" -f $manifest.проверено, $manifest.файлов, ($manifest.байт_всего / 1MB))
Write-Output ''

$missing = 0
$wrongSize = 0
$wrongHash = 0
$ok = 0
$rows = @()

foreach ($item in $manifest.файлы) {
    $path = Join-Path $engineDir ($item.путь -replace '/', '\')
    $name = $item.путь

    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        $rows += [pscustomobject]@{ Файл = $name; Состояние = 'НЕТ ФАЙЛА'; Байт = $item.байт; Примечание = 'положить по README' }
        $missing++
        continue
    }

    $size = (Get-Item -LiteralPath $path).Length
    if ($size -ne [long]$item.байт) {
        $rows += [pscustomobject]@{ Файл = $name; Состояние = 'РАЗМЕР'; Байт = $size; Примечание = "ожидался $($item.байт)" }
        $wrongSize++
        continue
    }

    $hash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLower()
    if ($hash -ne $item.sha256) {
        $rows += [pscustomobject]@{ Файл = $name; Состояние = 'SHA-256'; Байт = $size; Примечание = 'файл испорчен или другой сборки' }
        $wrongHash++
        continue
    }

    $rows += [pscustomobject]@{ Файл = $name; Состояние = 'ок'; Байт = $size; Примечание = $item.роль }
    $ok++
}

$rows | Format-Table -AutoSize | Out-String -Width 200 | Write-Output

Write-Output ("итог: совпало {0}, нет файла {1}, другой размер {2}, другой SHA-256 {3}" -f $ok, $missing, $wrongSize, $wrongHash)

if (($missing + $wrongSize + $wrongHash) -gt 0) {
    Write-Output ''
    Write-Output 'Что делать: см. README.md, раздел «Что в репозиторий НЕ входит».'
    Write-Output 'Восстановление под Windows x64: сборка whisper.cpp с BLAS + статическая сборка FFmpeg + модель q5_1.'
    exit 1
}

Write-Output 'Движок на месте: распознавание работать будет.'
exit 0
