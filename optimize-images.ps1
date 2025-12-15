# Image Optimization Script for Windows
# Converts large PNGs to optimized WebP (90% smaller!)

Write-Host "=== Image Optimization Tool ===" -ForegroundColor Green

# Check if you have ImageMagick or install it
$magickInstalled = Get-Command magick -ErrorAction SilentlyContinue

if (-not $magickInstalled) {
    Write-Host "`nImageMagick not found. Installing via winget..." -ForegroundColor Yellow
    winget install ImageMagick.ImageMagick

    Write-Host "`nPlease restart your terminal and run this script again!" -ForegroundColor Red
    exit
}

# Directories to optimize
$dirs = @("uploads", "assets/images/team")

$totalSaved = 0
$filesOptimized = 0

foreach ($dir in $dirs) {
    if (Test-Path $dir) {
        Write-Host "`nOptimizing images in $dir..." -ForegroundColor Cyan

        Get-ChildItem "$dir\*.png" | ForEach-Object {
            $pngFile = $_.FullName
            $webpFile = $pngFile -replace '\.png$', '.webp'
            $originalSize = $_.Length

            Write-Host "  Converting: $($_.Name)" -ForegroundColor Gray

            # Convert PNG to WebP with 80% quality
            & magick convert "$pngFile" -quality 80 -define webp:method=6 "$webpFile"

            if (Test-Path $webpFile) {
                $newSize = (Get-Item $webpFile).Length
                $saved = $originalSize - $newSize
                $totalSaved += $saved
                $filesOptimized++

                $savedMB = [math]::Round($saved / 1MB, 2)
                Write-Host "    Saved: $savedMB MB" -ForegroundColor Green

                # Remove old PNG
                Remove-Item $pngFile
                Write-Host "    Removed old PNG" -ForegroundColor Yellow
            }
        }
    }
}

$totalSavedMB = [math]::Round($totalSaved / 1MB, 2)
Write-Host "`n=== DONE ===" -ForegroundColor Green
Write-Host "Files optimized: $filesOptimized" -ForegroundColor Cyan
Write-Host "Total saved: $totalSavedMB MB" -ForegroundColor Cyan
Write-Host "`nNow run: git add . && git commit -m 'Optimize images' && git push" -ForegroundColor Yellow
