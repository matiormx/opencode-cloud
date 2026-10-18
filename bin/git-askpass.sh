#!/bin/sh
# Helper para GIT_ASKPASS: entrega el token de GitHub desde la variable de entorno GIT_TOKEN.
# El token nunca se escribe en .git/config ni en la URL del remoto.
case "$1" in
  Username*) echo "x-access-token" ;;
  *) echo "$GIT_TOKEN" ;;
esac
