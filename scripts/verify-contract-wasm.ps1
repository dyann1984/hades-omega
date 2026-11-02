# Rebuilds the audit contract from the COMMITTED tree in a throwaway Docker container (nothing installed on the host,
# nothing deployed) and prints the WASM SHA-256. Compare it with docs/contract-attestation.json.
#   powershell -File scripts\verify-contract-wasm.ps1
param([string]$KeepWasmTo)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$work = Join-Path ([IO.Path]::GetTempPath()) ("hades-wasm-" + [guid]::NewGuid().ToString('N'))
$src = Join-Path $work 'src'; $out = Join-Path $work 'out'
New-Item -ItemType Directory -Force $src, $out | Out-Null
try {
  git -C $repo archive HEAD packages/contracts -o (Join-Path $work 'c.tar'); tar -xf (Join-Path $work 'c.tar') -C $src
  docker run --rm -v "${src}:/src:ro" -v "${out}:/out" rust:1 sh -c 'cp -r /src/packages/contracts /work && cd /work && rustup target add wasm32-unknown-unknown >/dev/null 2>&1; cargo build --release --target wasm32-unknown-unknown --locked 2>&1 | tail -3; cp target/wasm32-unknown-unknown/release/hades_audit_registry.wasm /out/'
  $wasm = Join-Path $out 'hades_audit_registry.wasm'
  $att = Get-Content (Join-Path $repo 'docs\contract-attestation.json') -Raw | ConvertFrom-Json
  $hash = (Get-FileHash $wasm -Algorithm SHA256).Hash.ToLower()
  if ($KeepWasmTo) { Copy-Item $wasm $KeepWasmTo -Force }
  "wasm bytes : " + (Get-Item $wasm).Length
  "sha256      : $hash"
  "attested    : $($att.wasmSha256)"
  if ($hash -eq $att.wasmSha256) { 'MATCH: the build reproduces the attested artifact' } else { 'MISMATCH: do NOT deploy (toolchain, lockfile or source differ from the attestation)'; exit 1 }
} finally { Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue }
