# Проверка вставки на собственном стенде: печать и буфер обмена.
param(
  [ValidateSet('type', 'paste')] [string]$Mode = 'type',
  [string]$Sample = 'Привет! Это проверка вставки: «кавычки», ёжик и цифры 123.'
)

$ErrorActionPreference = 'Stop'

Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;

public class Wnd2 {
    public delegate bool Cb(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] public static extern bool EnumWindows(Cb cb, IntPtr l);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr ignored);
    [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool attach);

    public static IntPtr FindByTitle(string title) {
        IntPtr found = IntPtr.Zero;
        EnumWindows((h, l) => {
            var sb = new StringBuilder(256); GetWindowTextW(h, sb, 256);
            if (sb.ToString() == title) { found = h; return false; }
            return true;
        }, IntPtr.Zero);
        return found;
    }

    public static bool Focus(IntPtr h) {
        for (int i = 0; i < 8; i++) {
            ShowWindow(h, 9);
            keybd_event(0x12, 0, 0, UIntPtr.Zero);
            keybd_event(0x12, 0, 2, UIntPtr.Zero);
            uint target = GetWindowThreadProcessId(h, IntPtr.Zero);
            uint fore = GetWindowThreadProcessId(GetForegroundWindow(), IntPtr.Zero);
            uint self = GetCurrentThreadId();
            AttachThreadInput(self, target, true);
            AttachThreadInput(self, fore, true);
            SetForegroundWindow(h);
            AttachThreadInput(self, fore, false);
            AttachThreadInput(self, target, false);
            System.Threading.Thread.Sleep(350);
            if (GetForegroundWindow() == h) return true;
        }
        return false;
    }
}
"@

$hostScript = 'F:\ВОССОЗДАНИЕ_ПРИЛОЖЕНИЯ_Type_ГолосНабор\app\_test\host.ps1'
$contentFile = Join-Path $env:TEMP 'host-content.txt'
if (Test-Path $contentFile) { Remove-Item $contentFile -Force }

$hostProc = Start-Process powershell.exe -ArgumentList @('-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', "`"$hostScript`"") -PassThru
Start-Sleep -Seconds 4

$h = [Wnd2]::FindByTitle('Стенд вставки')
if ($h -eq [IntPtr]::Zero) { Stop-Process -Id $hostProc.Id -Force; throw 'окно стенда не найдено' }
"окно стенда: $h"
if (-not [Wnd2]::Focus($h)) { "ВНИМАНИЕ: фокус не подтверждён, продолжаю" } else { "фокус в стенде: да" }

$file = Join-Path $env:TEMP 'insert-sample.txt'
[System.IO.File]::WriteAllText($file, $Sample, (New-Object System.Text.UTF8Encoding($false)))
if ($Mode -eq 'paste') { Set-Clipboard -Value $Sample }

$script = 'F:\ВОССОЗДАНИЕ_ПРИЛОЖЕНИЯ_Type_ГолосНабор\app\lib\input.ps1'
$out = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script -Mode $Mode -TextFile $file 2>&1
"от helper: $out"
Start-Sleep -Seconds 1

$got = if (Test-Path $contentFile) { [System.IO.File]::ReadAllText($contentFile, [System.Text.Encoding]::UTF8) } else { '' }
"получено:  '$got'"
"ожидалось: '$Sample'"
if ($got.Trim() -eq $Sample.Trim()) { "РЕЗУЛЬТАТ: СОВПАЛО" } else { "РЕЗУЛЬТАТ: РАСХОЖДЕНИЕ" }

Stop-Process -Id $hostProc.Id -Force -ErrorAction SilentlyContinue
Get-Process -Name powershell -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq 'Стенд вставки' } | Stop-Process -Force -ErrorAction SilentlyContinue
