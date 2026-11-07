$ErrorActionPreference = 'Stop'

if (-not $env:COMMUNITY_TEST_DB_PASSWORD) {
  throw 'Set COMMUNITY_TEST_DB_PASSWORD to a dedicated local test password before running this script.'
}

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$composeFile = Join-Path $repositoryRoot 'docker-compose.community-test.yml'
$backendPath = Join-Path $repositoryRoot 'apps\backend-api'
$containerName = 'smartroute-community-test-postgres'

try {
  & docker info --format '{{.ServerVersion}}' *> $null
}
catch {
  throw 'Docker is installed but its daemon is unavailable. Start Docker Desktop and retry.'
}
if ($LASTEXITCODE -ne 0) {
  throw 'Docker is installed but its daemon is unavailable. Start Docker Desktop and retry.'
}

& docker compose -f $composeFile up -d --wait
if ($LASTEXITCODE -ne 0) {
  throw 'The dedicated community-report PostgreSQL test service did not become ready.'
}

& docker exec $containerName psql -U smartroute_test -d smartroute_community_test -v ON_ERROR_STOP=1 -c 'SELECT postgis_full_version();'
if ($LASTEXITCODE -ne 0) {
  throw 'PostGIS verification failed in the dedicated test database.'
}

$migrations = @(
  '/docker-entrypoint-initdb.d/02-community-incidents.sql',
  '/docker-entrypoint-initdb.d/03-community-incident-audit.sql',
  '/docker-entrypoint-initdb.d/04-subscription-foundation.sql',
  '/docker-entrypoint-initdb.d/05-subscription-audit-actor-context.sql'
)
foreach ($migration in $migrations) {
  foreach ($attempt in 1..2) {
    & docker exec $containerName psql -U smartroute_test -d smartroute_community_test -v ON_ERROR_STOP=1 -f $migration
    if ($LASTEXITCODE -ne 0) {
      throw "Migration $migration application $attempt failed."
    }
  }
}

$previousDatabaseUrl = $env:COMMUNITY_INCIDENT_TEST_DATABASE_URL
try {
  $escapedPassword = [Uri]::EscapeDataString($env:COMMUNITY_TEST_DB_PASSWORD)
  $env:COMMUNITY_INCIDENT_TEST_DATABASE_URL = "postgresql://smartroute_test:$escapedPassword@127.0.0.1:55432/smartroute_community_test"
  & npm.cmd --prefix $backendPath test -- --runInBand --runTestsByPath src/community-incidents/community-incident.postgres.integration.spec.ts src/subscriptions/subscription.postgres.integration.spec.ts
  if ($LASTEXITCODE -ne 0) {
    throw 'The PostgreSQL-backed community incident integration tests failed.'
  }
}
finally {
  if ($null -eq $previousDatabaseUrl) {
    Remove-Item Env:\COMMUNITY_INCIDENT_TEST_DATABASE_URL -ErrorAction SilentlyContinue
  }
  else {
    $env:COMMUNITY_INCIDENT_TEST_DATABASE_URL = $previousDatabaseUrl
  }
}

Write-Output 'PostGIS, migration idempotency, and PostgreSQL community incident/subscription integration tests passed.'
