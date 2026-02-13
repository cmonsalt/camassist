@echo off
title CamAssist - Generar CRX
echo.
echo ============================================
echo    CamAssist - Generador de CRX
echo ============================================
echo.

set "CHROME="

if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
)
if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    set "CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
)

if "%CHROME%"=="" (
    echo ERROR: Chrome no encontrado.
    pause
    exit /b 1
)

echo Chrome encontrado: %CHROME%
echo.

if not exist "public\updates\chaturbate" mkdir "public\updates\chaturbate"
if not exist "public\updates\stripchat" mkdir "public\updates\stripchat"
if not exist "public\updates\streamate" mkdir "public\updates\streamate"
if not exist "public\updates\xmodels" mkdir "public\updates\xmodels"
if not exist "keys" mkdir "keys"

echo Generando CRX Chaturbate...
if exist "keys\chaturbate.pem" (
    "%CHROME%" --pack-extension="%CD%\extension-chaturbate" --pack-extension-key="%CD%\keys\chaturbate.pem"
) else (
    "%CHROME%" --pack-extension="%CD%\extension-chaturbate"
    if exist "extension-chaturbate.pem" move /y "extension-chaturbate.pem" "keys\chaturbate.pem"
)
if exist "extension-chaturbate.crx" (
    move /y "extension-chaturbate.crx" "public\updates\chaturbate\camassist-cb.crx"
    echo   OK - chaturbate
) else (
    echo   FALLO - chaturbate
)

echo.
echo Generando CRX StripChat...
if exist "keys\stripchat.pem" (
    "%CHROME%" --pack-extension="%CD%\extension-stripchat" --pack-extension-key="%CD%\keys\stripchat.pem"
) else (
    "%CHROME%" --pack-extension="%CD%\extension-stripchat"
    if exist "extension-stripchat.pem" move /y "extension-stripchat.pem" "keys\stripchat.pem"
)
if exist "extension-stripchat.crx" (
    move /y "extension-stripchat.crx" "public\updates\stripchat\camassist-sc.crx"
    echo   OK - stripchat
) else (
    echo   FALLO - stripchat
)

echo.
echo Generando CRX Streamate...
if exist "keys\streamate.pem" (
    "%CHROME%" --pack-extension="%CD%\extension-streamate" --pack-extension-key="%CD%\keys\streamate.pem"
) else (
    "%CHROME%" --pack-extension="%CD%\extension-streamate"
    if exist "extension-streamate.pem" move /y "extension-streamate.pem" "keys\streamate.pem"
)
if exist "extension-streamate.crx" (
    move /y "extension-streamate.crx" "public\updates\streamate\camassist-st.crx"
    echo   OK - streamate
) else (
    echo   FALLO - streamate
)

echo.
echo Generando CRX XModels...
if exist "keys\xmodels.pem" (
    "%CHROME%" --pack-extension="%CD%\extension-xmodels" --pack-extension-key="%CD%\keys\xmodels.pem"
) else (
    "%CHROME%" --pack-extension="%CD%\extension-xmodels"
    if exist "extension-xmodels.pem" move /y "extension-xmodels.pem" "keys\xmodels.pem"
)
if exist "extension-xmodels.crx" (
    move /y "extension-xmodels.crx" "public\updates\xmodels\camassist-xm.crx"
    echo   OK - xmodels
) else (
    echo   FALLO - xmodels
)

echo.
echo Generando ZIPs...
powershell -Command "Compress-Archive -Path 'extension-chaturbate\*' -DestinationPath 'public\updates\chaturbate\extension.zip' -Force"
echo   OK - chaturbate.zip
powershell -Command "Compress-Archive -Path 'extension-stripchat\*' -DestinationPath 'public\updates\stripchat\extension.zip' -Force"
echo   OK - stripchat.zip
powershell -Command "Compress-Archive -Path 'extension-streamate\*' -DestinationPath 'public\updates\streamate\extension.zip' -Force"
echo   OK - streamate.zip
powershell -Command "Compress-Archive -Path 'extension-xmodels\*' -DestinationPath 'public\updates\xmodels\extension.zip' -Force"
echo   OK - xmodels.zip

echo.
echo ============================================
echo    Listo!
echo ============================================
echo.
echo Ahora:
echo   1. Actualiza versiones en api/chrome-updates.js
echo   2. Deploy: vercel --prod
echo.
pause
