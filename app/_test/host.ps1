# Стенд: простое окно с полем ввода, которое само сохраняет содержимое в файл.
# Нужен, чтобы проверять вставку без чужих программ и читать результат точно.
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.Text = 'Стенд вставки'
$form.Width = 640
$form.Height = 220
$form.StartPosition = 'CenterScreen'

$box = New-Object System.Windows.Forms.TextBox
$box.Multiline = $true
$box.Dock = 'Fill'
$box.Font = New-Object System.Drawing.Font('Segoe UI', 14)
$form.Controls.Add($box)

$out = Join-Path $env:TEMP 'host-content.txt'
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 200
$timer.Add_Tick({
    [System.IO.File]::WriteAllText($out, $box.Text, (New-Object System.Text.UTF8Encoding($false)))
})
$timer.Start()

$form.Add_Shown({
    $form.Activate()
    $box.Focus()
})

[System.Windows.Forms.Application]::Run($form)
