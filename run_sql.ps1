Add-Type -AssemblyName System.Windows.Forms

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinAPI {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, UIntPtr i);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    public struct RECT { public int L, T, R, B; }
}
"@

# SQL 파일에서 읽기
$sqlPath = Join-Path $PSScriptRoot "init.sql"
$sql = Get-Content $sqlPath -Raw -Encoding UTF8
Set-Clipboard -Value $sql
Write-Host "SQL 복사 완료 ($($sql.Length) 글자)"

# Supabase SQL Editor 열기
Start-Process "chrome.exe" "--new-window https://supabase.com/dashboard/project/lwllncasntzevgidsdro/sql/new"
Write-Host "SQL Editor 열기... 18초 대기"
Start-Sleep -Seconds 18

# Supabase 타이틀 Chrome 찾기
$target = Get-Process chrome -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowTitle -ne "" } |
    Sort-Object { if ($_.MainWindowTitle -match "Supabase") { 0 } else { 1 } } |
    Select-Object -First 1

if ($null -eq $target) {
    Write-Host "Chrome 창 없음 - 직접 실행하세요"
    exit 1
}

Write-Host "타겟: $($target.MainWindowTitle)"
[WinAPI]::ShowWindow($target.MainWindowHandle, 9)
[WinAPI]::BringWindowToTop($target.MainWindowHandle)
[WinAPI]::SetForegroundWindow($target.MainWindowHandle)
Start-Sleep -Milliseconds 1200

# 창 중앙+아래 클릭 (에디터 영역)
$rect = New-Object WinAPI+RECT
[WinAPI]::GetWindowRect($target.MainWindowHandle, [ref]$rect)
$cx = [int](($rect.L + $rect.R) / 2)
$cy = [int](($rect.T + $rect.B) / 2) + 60
[WinAPI]::SetCursorPos($cx, $cy)
Start-Sleep -Milliseconds 400
[WinAPI]::mouse_event(0x02, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 100
[WinAPI]::mouse_event(0x04, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 800

# 전체선택 → 붙여넣기 → 실행
[System.Windows.Forms.SendKeys]::SendWait("^a")
Start-Sleep -Milliseconds 500
[System.Windows.Forms.SendKeys]::SendWait("^v")
Write-Host "붙여넣기 완료"
Start-Sleep -Milliseconds 2000
[System.Windows.Forms.SendKeys]::SendWait("^{ENTER}")
Write-Host "실행 완료!"
Start-Sleep -Seconds 3
Write-Host "완료"
