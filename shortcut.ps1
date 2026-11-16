# Создание ярлыка «ГолосНабор» на рабочем столе.
param([string]$Kit = (Split-Path -Parent $MyInvocation.MyCommand.Path))
$ErrorActionPreference = 'Stop'
$target = Join-Path $Kit 'ЗАПУСТИТЬ.cmd'
$icon = Join-Path $Kit 'app\assets\app.png'
$link = Join-Path ([Environment]::GetFolderPath('Desktop')) 'ГолосНабор.lnk'
$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($link)
$sc.TargetPath = $target
$sc.WorkingDirectory = $Kit
if (Test-Path $icon) { $sc.IconLocation = $icon }
$sc.Description = 'ГолосНабор — диктовка с клавиши Scroll Lock'
$sc.Save()
Write-Output "ярлык: $link"