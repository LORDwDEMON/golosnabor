# Вставка текста в активное окно через SendInput (user32.dll).
# Два способа:
#   type  — посимвольная печать Unicode-событиями: не трогает буфер обмена
#           и работает там, где Ctrl+V не срабатывает;
#   paste — нажатие Ctrl+V отдельными шагами SendInput (надёжнее SendKeys).
# Текст передаётся файлом в UTF-8, чтобы не ломались кавычки и переносы строк.
# ВАЖНО: файл хранится в UTF-8 с BOM — Windows PowerShell 5.1 иначе читает
# кириллицу как ANSI и не разбирает скрипт.

param(
  [ValidateSet('type', 'paste')] [string]$Mode = 'type',
  [string]$TextFile = ''
)

$ErrorActionPreference = 'Stop'

$source = @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;

public static class InputSender
{
    [StructLayout(LayoutKind.Sequential)]
    public struct MOUSEINPUT
    {
        public int dx;
        public int dy;
        public uint mouseData;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct KEYBDINPUT
    {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct HARDWAREINPUT
    {
        public uint uMsg;
        public ushort wParamL;
        public ushort wParamH;
    }

    // Размер объединения должен быть равен самому большому члену (мышь):
    // иначе SendInput возвращает ошибку 87 «неверный параметр».
    [StructLayout(LayoutKind.Explicit)]
    public struct InputUnion
    {
        [FieldOffset(0)] public MOUSEINPUT mi;
        [FieldOffset(0)] public KEYBDINPUT ki;
        [FieldOffset(0)] public HARDWAREINPUT hi;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct INPUT
    {
        public uint type;
        public InputUnion U;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    private const uint INPUT_KEYBOARD = 1;
    private const uint KEYEVENTF_KEYUP = 0x0002;
    private const uint KEYEVENTF_UNICODE = 0x0004;

    private static void Send(INPUT[] inputs)
    {
        if (inputs == null || inputs.Length == 0) return;
        int size = Marshal.SizeOf(typeof(INPUT));
        uint sent = SendInput((uint)inputs.Length, inputs, size);
        if (sent != inputs.Length)
        {
            throw new InvalidOperationException(
                "SendInput принял " + sent + " из " + inputs.Length +
                " событий, код ошибки " + Marshal.GetLastWin32Error());
        }
    }

    private static INPUT Key(ushort vk, ushort scan, uint flags)
    {
        INPUT input = new INPUT();
        input.type = INPUT_KEYBOARD;
        input.U = new InputUnion();
        input.U.ki.wVk = vk;
        input.U.ki.wScan = scan;
        input.U.ki.dwFlags = flags;
        input.U.ki.time = 0;
        input.U.ki.dwExtraInfo = IntPtr.Zero;
        return input;
    }

    public static int TypeText(string text)
    {
        int typed = 0;
        var batch = new List<INPUT>(128);
        foreach (char ch in text)
        {
            if (ch == '\r') continue;
            if (ch == '\n')
            {
                batch.Add(Key(0x0D, 0, 0));
                batch.Add(Key(0x0D, 0, KEYEVENTF_KEYUP));
            }
            else
            {
                batch.Add(Key(0, ch, KEYEVENTF_UNICODE));
                batch.Add(Key(0, ch, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP));
            }
            typed++;

            // Короткие паузы в «хрупких» местах: после знаков и пробелов.
            // Приложения с автозаменой и полями ввода в браузере при слишком
            // быстром вводе теряют пробел после точки или вопроса.
            if (batch.Count >= 64 || ch == ' ' || ch == '.' || ch == ',' || ch == '!' || ch == '?' || ch == ':')
            {
                Send(batch.ToArray());
                batch.Clear();
                Thread.Sleep(ch == ' ' ? 6 : 9);
            }
        }
        Send(batch.ToArray());
        return typed;
    }

    public static void Paste()
    {
        // Ctrl вниз — пауза — V — пауза — Ctrl вверх: пауза нужна приложениям,
        // которые не успевают увидеть модификатор в одном пакете.
        Send(new[] { Key(0x11, 0, 0) });
        Thread.Sleep(40);
        Send(new[] { Key(0x56, 0, 0), Key(0x56, 0, KEYEVENTF_KEYUP) });
        Thread.Sleep(30);
        Send(new[] { Key(0x11, 0, KEYEVENTF_KEYUP) });
    }
}
'@

Add-Type -TypeDefinition $source -Language CSharp

# Пауза перед вводом: окну нужно время обработать смену фокуса,
# иначе первый знак может потеряться.
Start-Sleep -Milliseconds 150

if ($Mode -eq 'type') {
    if ([string]::IsNullOrEmpty($TextFile) -or -not (Test-Path -LiteralPath $TextFile)) {
        throw 'не передан файл с текстом'
    }
    $text = [System.IO.File]::ReadAllText($TextFile, [System.Text.Encoding]::UTF8)
    if ($text.Length -eq 0) { throw 'текст пуст' }
    $typed = [InputSender]::TypeText($text)
    Write-Output "впечатано знаков: $typed"
}
else {
    [InputSender]::Paste()
    Write-Output 'нажато Ctrl+V'
}
