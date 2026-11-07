$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$backendPath = Join-Path $repositoryRoot 'apps\backend-api'
$migrationsPath = Join-Path $repositoryRoot 'database\migrations'
$containerName = "smartroute-phase8-subscription-$([Guid]::NewGuid().ToString('N'))"
$databaseName = 'phase8_subscription_test'
$databaseUser = 'phase8_subscription_test'
$containerId = $null
$previousDatabaseUrl = $env:COMMUNITY_INCIDENT_TEST_DATABASE_URL
$randomBytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()

try {
  $rng.GetBytes($randomBytes)
  $testPassword = [BitConverter]::ToString($randomBytes).Replace('-', '').ToLowerInvariant()

  & docker info --format '{{.ServerVersion}}' *> $null
  if ($LASTEXITCODE -ne 0) {
    throw 'Docker daemon is unavailable.'
  }

  & docker run --detach `
    --name $containerName `
    --env "POSTGRES_DB=$databaseName" `
    --env "POSTGRES_USER=$databaseUser" `
    --env "POSTGRES_PASSWORD=$testPassword" `
    --tmpfs '/var/lib/postgresql/data:rw,size=1g' `
    --publish '127.0.0.1::5432' `
    postgis/postgis:16-3.5
  if ($LASTEXITCODE -ne 0) {
    throw 'Failed to start the isolated disposable PostgreSQL test container.'
  }

  $containerId = (& docker inspect --format '{{.Id}}' $containerName).Trim()
  $ready = $false
  foreach ($attempt in 1..60) {
    & docker exec $containerId pg_isready -U $databaseUser -d $databaseName *> $null
    if ($LASTEXITCODE -eq 0) {
      $ready = $true
      break
    }
    Start-Sleep -Seconds 2
  }
  if (-not $ready) {
    throw 'Disposable PostgreSQL did not become ready.'
  }

  $portMapping = (& docker port $containerId '5432/tcp').Trim()
  $hostPort = [int](($portMapping -split ':')[-1])

  $migrationNames = @(
    '001_platform_schema.sql',
    '002_authentication_security.sql',
    '003_vehicle_profiles.sql',
    '004_community_incidents.sql',
    '005_community_incident_audit.sql',
    '006_subscription_foundation.sql',
    '007_subscription_audit_actor_context.sql'
  )

  foreach ($migrationName in $migrationNames) {
    $migrationPath = Join-Path $migrationsPath $migrationName
    $containerMigrationPath = "/tmp/$migrationName"
    & docker cp $migrationPath "${containerId}:$containerMigrationPath"
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to stage $migrationName in the disposable test container."
    }

    foreach ($attempt in 1..2) {
      & docker exec `
        --env "PGPASSWORD=$testPassword" `
        $containerId `
        psql -h 127.0.0.1 -U $databaseUser -d $databaseName -v ON_ERROR_STOP=1 -f $containerMigrationPath
      if ($LASTEXITCODE -ne 0) {
        throw "Migration $migrationName application $attempt failed."
      }
    }
  }

  $escapedPassword = [Uri]::EscapeDataString($testPassword)
  $env:COMMUNITY_INCIDENT_TEST_DATABASE_URL = "postgresql://${databaseUser}:${escapedPassword}@127.0.0.1:${hostPort}/${databaseName}"
  & npm.cmd --prefix $backendPath test -- --runInBand --runTestsByPath `
    src/subscriptions/subscription.postgres.integration.spec.ts `
    src/subscriptions/subscription.api.postgres.integration.spec.ts
  if ($LASTEXITCODE -ne 0) {
    throw 'Subscription PostgreSQL integration tests failed.'
  }

  Write-Output 'Disposable PostgreSQL migrations 001-007 (each applied twice) and subscription integration tests passed.'
}
finally {
  $rng.Dispose()
  [Array]::Clear($randomBytes, 0, $randomBytes.Length)
  Remove-Variable testPassword -ErrorAction SilentlyContinue

  if ($null -eq $previousDatabaseUrl) {
    Remove-Item Env:\COMMUNITY_INCIDENT_TEST_DATABASE_URL -ErrorAction SilentlyContinue
  }
  else {
    $env:COMMUNITY_INCIDENT_TEST_DATABASE_URL = $previousDatabaseUrl
  }

  if ($containerId) {
    & docker rm --force $containerId *> $null
  }
}
