param(
    [Parameter(Mandatory = $true)]
    [string]$WorkerScript,

    [string]$TaskName = "JwtRefreshWorker",
    [string]$WorkingDirectory = "",
    [string]$TargetUser = "",
    [string]$NodePath = "",
    [int]$KeepAliveMinutes = 30
)

$ErrorActionPreference = "Stop"

function Get-AccountSid {
    param([string]$AccountName)

    if ([string]::IsNullOrWhiteSpace($AccountName)) {
        return $null
    }

    try {
        $account = New-Object System.Security.Principal.NTAccount($AccountName)
        $sid = $account.Translate([System.Security.Principal.SecurityIdentifier])
        return [string]$sid.Value
    } catch {
        return $null
    }
}

function Test-IsServiceAccount {
    param([string]$AccountName)

    $sid = Get-AccountSid -AccountName $AccountName
    return $sid -in @(
        "S-1-5-18",
        "S-1-5-19",
        "S-1-5-20"
    )
}

function Resolve-InteractiveUser {
    param([string]$ExplicitUser)

    if (-not [string]::IsNullOrWhiteSpace($ExplicitUser)) {
        if (Test-IsServiceAccount $ExplicitUser) {
            throw ("Refusing service account for interactive worker: " + $ExplicitUser)
        }
        return $ExplicitUser
    }

    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $currentSid = [string]$identity.User.Value
    $currentUser = [string]$identity.Name

    if (
        $currentSid -notin @("S-1-5-18", "S-1-5-19", "S-1-5-20") -and
        -not [string]::IsNullOrWhiteSpace($currentUser)
    ) {
        return $currentUser
    }

    try {
        $computerUser = [string](Get-CimInstance Win32_ComputerSystem -ErrorAction Stop).UserName
        if (
            -not [string]::IsNullOrWhiteSpace($computerUser) -and
            -not (Test-IsServiceAccount $computerUser)
        ) {
            return $computerUser
        }
    } catch {
        # Fallback below.
    }

    try {
        $explorers = Get-CimInstance Win32_Process -Filter "Name = 'explorer.exe'" -ErrorAction SilentlyContinue
        foreach ($process in $explorers) {
            try {
                $owner = Invoke-CimMethod -InputObject $process -MethodName GetOwner -ErrorAction Stop
                if ($owner.ReturnValue -eq 0 -and $owner.User) {
                    $candidate = if ($owner.Domain) {
                        [string]$owner.Domain + "\\" + [string]$owner.User
                    } else {
                        [string]$owner.User
                    }

                    if (-not (Test-IsServiceAccount $candidate)) {
                        return $candidate
                    }
                }
            } catch {
                # Try the next explorer process.
            }
        }
    } catch {
        # No interactive desktop session.
    }

    return $null
}

$worker = (Resolve-Path $WorkerScript).Path

if ([string]::IsNullOrWhiteSpace($WorkingDirectory)) {
    $WorkingDirectory = Split-Path -Parent $worker
}

$userId = Resolve-InteractiveUser -ExplicitUser $TargetUser
if ([string]::IsNullOrWhiteSpace($userId)) {
    throw "No interactive Windows user detected."
}

if (Test-IsServiceAccount $userId) {
    throw ("Refusing to register an interactive worker under service account: " + $userId)
}

if ([string]::IsNullOrWhiteSpace($NodePath)) {
    $NodePath = (Get-Command node -ErrorAction Stop).Source
}

$argument = '"' + $worker + '"'
$action = New-ScheduledTaskAction -Execute $NodePath -Argument $argument -WorkingDirectory $WorkingDirectory
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -StartWhenAvailable -MultipleInstances IgnoreNew -Hidden
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
$logonTrigger = New-ScheduledTaskTrigger -AtLogOn -User $userId

$triggers = @($logonTrigger)
if ($KeepAliveMinutes -gt 0) {
    $keepAliveTrigger = New-ScheduledTaskTrigger `
        -Once `
        -At (Get-Date).AddMinutes(2) `
        -RepetitionInterval (New-TimeSpan -Minutes $KeepAliveMinutes) `
        -RepetitionDuration (New-TimeSpan -Days 3650)
    $triggers += $keepAliveTrigger
}

$task = New-ScheduledTask -Action $action -Trigger $triggers -Settings $settings -Principal $principal

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
}

Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Out-Null

$registered = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
$registeredUser = [string]$registered.Principal.UserId

if (Test-IsServiceAccount $registeredUser) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    throw ("Task unexpectedly registered under service account: " + $registeredUser)
}

Write-Host ("Interactive refresh worker READY under " + $registeredUser + " : " + $TaskName) -ForegroundColor Green
