# Rifa' i WAV di assets\suoni dalla banca di earshot (MIT), con gli stessi id, seed e manopole
# scritti in assets\suoni\NOTICE.md. earshot non e' una dipendenza del prodotto: sta in un venv
# a parte, il cui percorso e' $env:THE_CLIP_EARSHOT (default: lo scratchpad usato in sviluppo).
#
#   git clone --depth 1 https://github.com/Leonxlnx/earshot <cartella>
#   cd <cartella>; python -m venv --system-site-packages .venv; .venv\Scripts\python -m pip install -e .
#   $env:THE_CLIP_EARSHOT = '<cartella>'; .\strumenti\rigenera-suoni.ps1
$ErrorActionPreference = 'Stop'
if (-not $env:THE_CLIP_EARSHOT) { throw 'Set THE_CLIP_EARSHOT to the folder of an earshot checkout with its venv.' }
$earshot = $env:THE_CLIP_EARSHOT
$py = Join-Path $earshot '.venv\Scripts\python.exe'
if (-not (Test-Path $py)) { throw "earshot non trovato: manca $py (clona il repo e crea il venv, oppure imposta THE_CLIP_EARSHOT)" }
$dest = Join-Path (Split-Path $PSScriptRoot -Parent) 'assets\suoni'
New-Item -ItemType Directory -Force $dest | Out-Null

# id della banca, file di uscita, manopole: gli stessi del NOTICE (il seed e' quello proprio del suono)
$suoni = @(
  @{ id = 'pro_click/mouse';     file = 'click.wav';    extra = @() },
  @{ id = 'pro_typing_key/soft'; file = 'key.wav';      extra = @('--dur', '0.09') },
  @{ id = 'whoosh_fast/tight';   file = 'zoom-in.wav';  extra = @('--dur', '0.45', '--apex', '0.14') },
  @{ id = 'whoosh_fast/reverse'; file = 'zoom-out.wav'; extra = @('--dur', '0.6', '--apex', '0.25') }
)
foreach ($s in $suoni) {
  $out = Join-Path $dest $s.file
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  & $py -m earshot sfx render $s.id -o $out --sr 48000 --peak -3 @($s.extra)
  if ($LASTEXITCODE -ne 0) { throw "earshot sfx render $($s.id) e' uscito con $LASTEXITCODE" }
  Write-Host ("{0,-14} <- {1,-22} {2,6} ms  {3,8} byte" -f $s.file, $s.id, $sw.ElapsedMilliseconds, (Get-Item $out).Length)
}
