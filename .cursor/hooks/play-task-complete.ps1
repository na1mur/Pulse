# Plays when a Cursor agent task finishes (stop hook).
# Uses Windows built-in Alarm05.wav — long and attention-grabbing.

$null = [Console]::In.ReadToEnd()

$soundPath = Join-Path $env:Windir "Media\Alarm01.wav"
if (-not (Test-Path -LiteralPath $soundPath)) {
    $soundPath = Join-Path $env:Windir "Media\Windows Exclamation.wav"
}

$player = New-Object System.Media.SoundPlayer $soundPath
$player.PlaySync()

exit 0
