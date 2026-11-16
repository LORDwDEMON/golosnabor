# Стенд проверки вставки: Блокнот получает текст, затем содержимое читается обратно.
param(
  [ValidateSet('type', 'paste')] [string]$Mode = 'type',
  [string]$Sample = 'Привет! Это проверка вставки: «кавычки», ёжик и цифры 123.'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes

Add-Type @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public class Wnd {
    public delegate bool Cb(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] public static extern bool EnumWindows(Cb cb, IntPtr l);
    [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent, Cb cb, IntPtr l);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassNameW(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr ignored);
    [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool attach);
    [DllImport("user32.dll")] public static extern IntPtr SendMessageW(IntPtr h, uint msg, IntPtr wp, StringBuilder lp);

    public static IntPtr FindWindowOf(uint pid) {
        IntPtr found = IntPtr.Zero;
        EnumWindows((h, l) => {
            uint p; GetWindowThreadProcessId(h, out p);
            if (p == pid) {
                var sb = new StringBuilder(256); GetWindowTextW(h, sb, 256);
                if (sb.Length > 0) { found = h; return false; }
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }

    public static List<IntPtr> Children(IntPtr parent) {
        var list = new List<IntPtr>();
        EnumChildWindows(parent, (h, l) => { list.Add(h); return true; }, IntPtr.Zero);
        return list;
    }

    public static string ClassOf(IntPtr h) {
        var sb = new StringBuilder(256); GetClassNameW(h, sb, 256); return sb.ToString();
    }

    public static string TextOf(IntPtr h, int max) {
        var sb = new StringBuilder(max);
        SendMessageW(h, 0x000D, (IntPtr)max, sb);
        return sb.ToString();
    }

    // Захват фокуса с присоединением к потоку активного окна и повторами.
    public static bool Focus(IntPtr h) {
        for (int attempt = 0; attempt < 6; attempt++) {
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
            System.Threading.Thread.Sleep(450);
            if (GetForegroundWindow() == h) return true;
        }
        return GetForegroundWindow() == h;
    }
}
"@

# Чистый Блокнот: закрываем те, что остались от прошлых проверок
Get-Process -Name notepad -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 800
Start-Process notepad.exe | Out-Null
Start-Sleep -Seconds 3

$proc = Get-Process -Name notepad -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $proc) { throw 'Блокнот не запустился' }

$h = [Wnd]::FindWindowOf([uint32]$proc.Id)
"окно Блокнота: $h"
if (-not [Wnd]::Focus($h)) { throw 'не удалось поставить фокус в Блокнот' }
"фокус в Блокноте: да"

$edit = $null
foreach ($child in [Wnd]::Children($h)) {
    $cls = [Wnd]::ClassOf($child)
    if ($cls -match 'Edit|RichEdit|TextBox') { $edit = $child; "поле ввода: класс $cls"; break }
}
if (-not $edit) { throw 'поле ввода не найдено' }

# Вставка
$file = Join-Path $env:TEMP 'insert-sample.txt'
[System.IO.File]::WriteAllText($file, $Sample, (New-Object System.Text.UTF8Encoding($false)))
if ($Mode -eq 'paste') { Set-Clipboard -Value $Sample }

$script = 'F:\ВОССОЗДАНИЕ_ПРИЛОЖЕНИЯ_Type_ГолосНабор\app\lib\input.ps1'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script -Mode $Mode -TextFile $file
Start-Sleep -Milliseconds 900

# Чтение результата: сначала UI Automation, затем WM_GETTEXT
$got = ''
try {
    $root = [System.Windows.Automation.AutomationElement]::FromHandle($h)
    $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ClassNameProperty, 'NotepadTextBox')
    $box = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
    if ($box) {
        $vp = $box.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
        $got = $vp.Current.Value
        "прочитано через UI Automation"
    }
} catch { "UI Automation не сработал: $($_.Exception.Message)" }
if ([string]::IsNullOrEmpty($got)) { $got = [Wnd]::TextOf($edit, 4096); "прочитано через WM_GETTEXT" }

"получено:  '$got'"
"ожидалось: '$Sample'"
if ($got.Trim() -eq $Sample.Trim()) { "РЕЗУЛЬТАТ: СОВПАЛО" } else { "РЕЗУЛЬТАТ: РАСХОЖДЕНИЕ" }
