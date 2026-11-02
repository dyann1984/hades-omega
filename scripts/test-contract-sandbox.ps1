# Runs the contract unit tests and the near-sandbox integration tests (packages/contracts/sandbox-tests) against the release
# WASM, in a throwaway Docker container built from the COMMITTED tree. Local sandbox only: no testnet, no funds, no keys.
#   powershell -File scripts\test-contract-sandbox.ps1
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$work = Join-Path ([IO.Path]::GetTempPath()) ("hades-sbx-" + [guid]::NewGuid().ToString('N'))
$src = Join-Path $work 'src'; New-Item -ItemType Directory -Force $src | Out-Null
try {
  git -C $repo archive HEAD packages/contracts -o (Join-Path $work 'c.tar'); tar -xf (Join-Path $work 'c.tar') -C $src
  # The container script lives in a file: PowerShell 5.1 strips double quotes from native-command arguments.
  [IO.File]::WriteAllText((Join-Path $work 'run.sh'), "set -e`ncp -r /src/packages/contracts /work`ncd /work`nrustup target add wasm32-unknown-unknown >/dev/null 2>&1`ncargo test --locked 2>&1 | grep 'test result' | head -1`ncargo build --release --target wasm32-unknown-unknown --locked 2>&1 | tail -1`nsha256sum target/wasm32-unknown-unknown/release/hades_audit_registry.wasm`ncd sandbox-tests`ncargo test 2>&1 | grep -E '^test |test result'`n")
  docker run --rm -v "${src}:/src:ro" -v "${work}:/sh:ro" rust:1 sh /sh/run.sh
} finally { Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue }
