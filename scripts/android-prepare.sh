#!/usr/bin/env bash
# Roda DEPOIS de "npx cap add android": aplica ícones, permissões e versão ao projeto Android gerado.
set -euo pipefail
cd "$(dirname "$0")/.."

RES=android/app/src/main/res
MANIFEST=android/app/src/main/AndroidManifest.xml

cp -r android-res/* "$RES/"

if ! grep -q POST_NOTIFICATIONS "$MANIFEST"; then
  sed -i 's#<application#<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />\n    <application#' "$MANIFEST"
fi

if [ -n "${BUILD_NUMBER:-}" ]; then
  sed -i "s/versionCode [0-9]*/versionCode ${BUILD_NUMBER}/; s/versionName \"[^\"]*\"/versionName \"1.0.${BUILD_NUMBER}\"/" android/app/build.gradle
fi

echo "Projeto Android preparado."
