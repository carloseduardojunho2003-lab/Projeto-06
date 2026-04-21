param(
  [string]$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

function New-RoundedRectPath {
  param(
    [float]$X,
    [float]$Y,
    [float]$Width,
    [float]$Height,
    [float]$Radius
  )

  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $Radius * 2
  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function Fill-RoundedGradientRect {
  param(
    [System.Drawing.Graphics]$Graphics,
    [float]$X,
    [float]$Y,
    [float]$Width,
    [float]$Height,
    [float]$Radius,
    [string]$TopColor,
    [string]$BottomColor
  )

  $path = New-RoundedRectPath -X $X -Y $Y -Width $Width -Height $Height -Radius $Radius
  try {
    $rect = New-Object System.Drawing.RectangleF($X, $Y, $Width, $Height)
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, ([System.Drawing.ColorTranslator]::FromHtml($BottomColor)), ([System.Drawing.ColorTranslator]::FromHtml($TopColor)), 90)
    try {
      $Graphics.FillPath($brush, $path)
    } finally {
      $brush.Dispose()
    }
  } finally {
    $path.Dispose()
  }
}

function Resize-Bitmap {
  param(
    [System.Drawing.Bitmap]$Source,
    [int]$Size
  )

  $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
  $bitmap.SetResolution(96, 96)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.DrawImage($Source, 0, 0, $Size, $Size)
  $graphics.Dispose()
  return $bitmap
}

function Save-MultiSizeIco {
  param(
    [System.Drawing.Bitmap]$Source,
    [string]$OutputPath
  )

  $sizes = @(16, 24, 32, 48, 64, 128, 256)
  $entries = New-Object System.Collections.Generic.List[object]
  foreach ($size in $sizes) {
    $bitmap = Resize-Bitmap -Source $Source -Size $size
    $memoryStream = New-Object System.IO.MemoryStream
    try {
      $bitmap.Save($memoryStream, [System.Drawing.Imaging.ImageFormat]::Png)
      $entries.Add([pscustomobject]@{
        Size = $size
        Bytes = $memoryStream.ToArray()
      })
    } finally {
      $memoryStream.Dispose()
      $bitmap.Dispose()
    }
  }

  $fileStream = [System.IO.File]::Open($OutputPath, [System.IO.FileMode]::Create)
  $writer = New-Object System.IO.BinaryWriter($fileStream)
  try {
    $writer.Write([UInt16]0)
    $writer.Write([UInt16]1)
    $writer.Write([UInt16]$entries.Count)
    $offset = 6 + ($entries.Count * 16)

    foreach ($entry in $entries) {
      $dimensionByte = if ($entry.Size -ge 256) { [byte]0 } else { [byte]$entry.Size }
      $writer.Write($dimensionByte)
      $writer.Write($dimensionByte)
      $writer.Write([byte]0)
      $writer.Write([byte]0)
      $writer.Write([UInt16]1)
      $writer.Write([UInt16]32)
      $writer.Write([UInt32]$entry.Bytes.Length)
      $writer.Write([UInt32]$offset)
      $offset += $entry.Bytes.Length
    }

    foreach ($entry in $entries) {
      $writer.Write($entry.Bytes)
    }
  } finally {
    $writer.Flush()
    $writer.Dispose()
    $fileStream.Dispose()
  }
}

function New-BrandBitmap {
  param([int]$Size = 1024)

  $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
  $bitmap.SetResolution(96, 96)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $backgroundRect = New-Object System.Drawing.RectangleF(86, 86, 852, 852)
  $backgroundPath = New-RoundedRectPath -X 86 -Y 86 -Width 852 -Height 852 -Radius 188
  try {
    $backgroundBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($backgroundRect, ([System.Drawing.ColorTranslator]::FromHtml('#0A1834')), ([System.Drawing.ColorTranslator]::FromHtml('#1B2147')), 135)
    try {
      $graphics.FillPath($backgroundBrush, $backgroundPath)
    } finally {
      $backgroundBrush.Dispose()
    }

    $glowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $glowPath.AddEllipse(200, 120, 620, 440)
    $glowBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush($glowPath)
    try {
      $glowBrush.CenterColor = [System.Drawing.Color]::FromArgb(88, 73, 116, 206)
      $glowBrush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 10, 24, 52))
      $graphics.FillPath($glowBrush, $backgroundPath)
    } finally {
      $glowBrush.Dispose()
      $glowPath.Dispose()
    }
  } finally {
    $backgroundPath.Dispose()
  }

  $sparkles = @(
    @(688, 214, 8),
    @(618, 266, 6),
    @(562, 334, 5),
    @(458, 290, 4),
    @(362, 406, 6),
    @(314, 452, 4)
  )
  foreach ($sparkle in $sparkles) {
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(220, 114, 247, 255))
    try {
      $graphics.FillEllipse($brush, $sparkle[0] - $sparkle[2], $sparkle[1] - $sparkle[2], $sparkle[2] * 2, $sparkle[2] * 2)
    } finally {
      $brush.Dispose()
    }
  }

  $arcPen = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml('#28C2FF'), 38)
  $arcPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $arcPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  try {
    $arcPoints = [System.Drawing.PointF[]]@(
      (New-Object System.Drawing.PointF(178, 742)),
      (New-Object System.Drawing.PointF(298, 866)),
      (New-Object System.Drawing.PointF(595, 888)),
      (New-Object System.Drawing.PointF(834, 610))
    )
    $graphics.DrawCurve($arcPen, $arcPoints)
  } finally {
    $arcPen.Dispose()
  }

  Fill-RoundedGradientRect -Graphics $graphics -X 300 -Y 560 -Width 90 -Height 150 -Radius 24 -TopColor '#86FF87' -BottomColor '#1FB3FF'
  Fill-RoundedGradientRect -Graphics $graphics -X 438 -Y 482 -Width 96 -Height 228 -Radius 24 -TopColor '#90FF83' -BottomColor '#20B6FF'
  Fill-RoundedGradientRect -Graphics $graphics -X 576 -Y 446 -Width 104 -Height 264 -Radius 24 -TopColor '#98FF7C' -BottomColor '#26BBFF'
  Fill-RoundedGradientRect -Graphics $graphics -X 720 -Y 352 -Width 98 -Height 358 -Radius 24 -TopColor '#A2FF74' -BottomColor '#31C2FF'

  $arrowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $arrowPath.StartFigure()
  $arrowPath.AddLines([System.Drawing.PointF[]]@(
    (New-Object System.Drawing.PointF(216, 674)),
    (New-Object System.Drawing.PointF(418, 412)),
    (New-Object System.Drawing.PointF(588, 492)),
    (New-Object System.Drawing.PointF(746, 298))
  ))
  $arrowBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush((New-Object System.Drawing.RectangleF(216, 248, 530, 426)), ([System.Drawing.ColorTranslator]::FromHtml('#35C2FF')), ([System.Drawing.ColorTranslator]::FromHtml('#A1FF74')), 315)
  $arrowPen = New-Object System.Drawing.Pen($arrowBrush, 64)
  $arrowPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $arrowPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $arrowPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  try {
    $graphics.DrawPath($arrowPen, $arrowPath)
  } finally {
    $arrowPen.Dispose()
    $arrowBrush.Dispose()
    $arrowPath.Dispose()
  }

  $headPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $headPath.AddPolygon([System.Drawing.PointF[]]@(
    (New-Object System.Drawing.PointF(696, 248)),
    (New-Object System.Drawing.PointF(882, 208)),
    (New-Object System.Drawing.PointF(836, 390)),
    (New-Object System.Drawing.PointF(770, 332))
  ))
  $headBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush((New-Object System.Drawing.RectangleF(696, 208, 186, 182)), ([System.Drawing.ColorTranslator]::FromHtml('#35C2FF')), ([System.Drawing.ColorTranslator]::FromHtml('#A1FF74')), 315)
  try {
    $graphics.FillPath($headBrush, $headPath)
  } finally {
    $headBrush.Dispose()
    $headPath.Dispose()
  }

  $graphics.Dispose()
  return $bitmap
}

$desktopAssetsDir = Join-Path $ProjectDir 'desktop\assets'
New-Item -ItemType Directory -Path $desktopAssetsDir -Force | Out-Null

$master = New-BrandBitmap -Size 1024
try {
  $desktopPngPath = Join-Path $desktopAssetsDir 'app-icon.png'
  $icon512Path = Join-Path $ProjectDir 'icon-512.png'
  $icon192Path = Join-Path $ProjectDir 'icon-192.png'
  $iconIcoPath = Join-Path $desktopAssetsDir 'app-icon.ico'

  $icon512 = Resize-Bitmap -Source $master -Size 512
  try {
    $icon512.Save($desktopPngPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $icon512.Save($icon512Path, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $icon512.Dispose()
  }

  $icon192 = Resize-Bitmap -Source $master -Size 192
  try {
    $icon192.Save($icon192Path, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $icon192.Dispose()
  }

  Save-MultiSizeIco -Source $master -OutputPath $iconIcoPath
} finally {
  $master.Dispose()
}

[pscustomobject]@{
  appIconPng = (Resolve-Path (Join-Path $desktopAssetsDir 'app-icon.png')).Path
  appIconIco = (Resolve-Path (Join-Path $desktopAssetsDir 'app-icon.ico')).Path
  icon192 = (Resolve-Path (Join-Path $ProjectDir 'icon-192.png')).Path
  icon512 = (Resolve-Path (Join-Path $ProjectDir 'icon-512.png')).Path
} | ConvertTo-Json -Depth 4