# Corre la E2E de los 3 roles en Edge headless. Desde PowerShell (no desde Bash: msedge no esta en el PATH).
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\test\e2e.ps1
# ASCII puro a proposito (PS 5.1 lee sin BOM como ANSI).
# v0.162.0 (Gastos, de la ERP v1): gerencia juega tesoreria y colaborador contabilidad (ERP_Roles, por default en pruebas.html);
# 'sin-gastos' = colaborador SIN ERP_Gastos/ERP_Roles/biblioteca: todo lo demas debe pasar igual.
# 'sin-rol-gastos' = colaborador con las listas pero SIN rol en ERP_Roles: registra y ve lo suyo, sin pestanas.
param([string[]]$Roles = @('gerencia', 'colaborador', 'lectura', 'sin-gastos', 'sin-rol-gastos'))
$consulta = @{ 'sin-gastos' = 'rol=colaborador&gastos=no'; 'sin-rol-gastos' = 'rol=colaborador&erp=ninguno' }
$app = Split-Path -Parent $PSScriptRoot
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { Write-Host "No esta Edge en $edge"; exit 1 }
# C-01 (v0.90.0): puerto EFIMERO (--puerto 0) y se lee de la primera linea de la salida del servidor, asi dos corridas conviven
# y ninguna mide la app de OTRA sesion. Si el servidor muere o no anuncia puerto en 5 s, exit 2 (antes: 8080 fijo y ocupado).
$log = Join-Path $env:TEMP ("proy-e2e-srv-" + $PID + ".txt")
$srv = Start-Process -FilePath node -ArgumentList "servidor-local.js", "test/pruebas.html", "--puerto", "0" -WorkingDirectory $app -PassThru -WindowStyle Hidden -RedirectStandardOutput $log
$puerto = $null
foreach ($i in 1..25) {
    Start-Sleep -Milliseconds 200
    if ($srv.HasExited) { break }
    if ((Test-Path $log) -and ((Get-Content $log -Raw) -match 'PUERTO (\d+)')) { $puerto = $Matches[1]; break }
}
if (-not $puerto) { Write-Host ('SERVIDOR SIN PUERTO: murio al arrancar o no anuncio "PUERTO n" en 5 s (ver ' + $log + ').'); if (-not $srv.HasExited) { Stop-Process -Id $srv.Id -Force }; exit 2 }
Write-Host "servidor en el puerto $puerto"
# Reloj VIRTUAL de cada corrida (cubeta 4 del rediseno, 2026-10-03): al agotarse, Edge vuelca el DOM a media prueba y no hay resumen.
# Medido al cierre de la cubeta 3: gerencia 117 s y colaborador 98 s de 120 (casi todo son las pausas de 10.5 s del tope de pushState);
# con 120 una corrida cargada de colaborador se corto en 800 de 958. Con el reloj ocioso, Edge adelanta el tiempo virtual: un
# presupuesto mayor no alarga la corrida real. Cada escenario imprime lo que uso y avisa al pasar del 80 %.
$presupuesto = 240000
# Tope de tiempo REAL por escenario (cubeta 6 del rediseno, 2026-10-03): dos veces en dos cubetas Edge headless vuelca el DOM completo y NO
# sale (11 min parado con el resumen ya escrito). Un vigia mata ESE Edge (dump-dom + este puerto + esta consulta) a los $topeReal s: lo ya
# volcado llega igual a Out-File y se lee como siempre. Una corrida normal tarda 20-90 s reales.
$topeReal = 180
$fallas = 0
try {
    foreach ($rol in $Roles) {
        $out = Join-Path $env:TEMP "proy-e2e-$rol.html"
        $q = if ($consulta.ContainsKey($rol)) { $consulta[$rol] } else { "rol=$rol" }
        $url = "http://localhost:$puerto/?$q&refresco=0"
        $vigia = Start-Job -ArgumentList $url, $topeReal -ScriptBlock { param($u, $seg) Start-Sleep -Seconds $seg; Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains('--dump-dom') -and $_.CommandLine.Contains($u) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; 'matado' } }
        & $edge --headless=new --disable-gpu --virtual-time-budget=$presupuesto --dump-dom $url 2>$null | Out-File -Encoding utf8 $out
        $mato = if ($vigia.State -eq 'Completed') { Receive-Job $vigia } else { $null }
        Stop-Job $vigia -ErrorAction SilentlyContinue; Remove-Job $vigia -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
        $s = Get-Content $out -Raw -Encoding UTF8
        Write-Host "=== $rol"
        if ($mato) { Write-Host ("  AVISO: Edge no salio en $topeReal s reales y el vigia lo mato; se lee lo que alcanzo a volcar") }
        # El resumen se busca en el <title>: el texto 'PRUEBAS TERMINADAS: ' tambien esta en el codigo de pruebas.html y, sin resumen,
        # la busqueda suelta imprimia un pedazo de ese codigo en vez de decir que la corrida no termino.
        if ($s -match '<title>PRUEBAS TERMINADAS: ([^<]+)') { Write-Host ("  " + $Matches[1]); if ($Matches[1] -notmatch ' 0 falla') { $fallas++ } }
        else {
            $ultima = [regex]::Matches($s, '\[(OK|FALLA)\][^\n]*') | Select-Object -Last 1
            Write-Host ("  SIN RESUMEN: la corrida no termino (se acabo el reloj virtual de " + ($presupuesto / 1000) + " s o la pagina se colgo). Ultima linea: " + $(if ($ultima) { $ultima.Value } else { '(ninguna)' }))
            $fallas++
        }
        if ($s -match 'al terminar: (\d+) s') { $usados = [int]$Matches[1]; $tope = $presupuesto / 1000; Write-Host ("  reloj virtual: $usados s de $tope"); if ($usados -gt 0.8 * $tope) { Write-Host "  AVISO: paso del 80 % del reloj virtual; sube `$presupuesto antes de que se corte una corrida" } }
        [regex]::Matches($s, '\[FALLA\][^\n]*') | ForEach-Object { Write-Host ("  " + $_.Value) }
    }
} finally { Stop-Process -Id $srv.Id -Force }
if ($fallas) { exit 1 }
exit 0
