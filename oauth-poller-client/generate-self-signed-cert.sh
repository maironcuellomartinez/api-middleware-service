#!/usr/bin/env bash
# Genera un certificado autofirmado para probar MW_CA_CERT_PATH contra un
# staging propio que todavia no tiene un certificado emitido por una CA
# real (Let's Encrypt, etc). El navegador/otros clientes van a mostrar
# advertencia de "certificado no confiable" — normal y esperado con
# autofirmado, no es un bug.
#
# Cuando el servidor real ya tenga un certificado de una CA de confianza,
# MW_CA_CERT_PATH deja de ser necesario.
#
# Uso: bash generate-self-signed-cert.sh [dominio]
#   (default: localhost)
#
# En Git Bash / Windows: si da error "subject name is expected to be in the
# format..." es el bug de MSYS que traduce "/CN=..." como si fuera una ruta
# de Windows. Correr con: MSYS_NO_PATHCONV=1 bash generate-self-signed-cert.sh
set -euo pipefail
cd "$(dirname "$0")"

DOMAIN="${1:-localhost}"
mkdir -p certs

openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout certs/privkey.pem \
  -out certs/fullchain.pem \
  -days 365 \
  -subj "/CN=${DOMAIN}" \
  -addext "subjectAltName=DNS:${DOMAIN}" \
  -addext "basicConstraints=critical,CA:FALSE" \
  -addext "keyUsage=critical,digitalSignature,keyEncipherment" \
  -addext "extendedKeyUsage=serverAuth"

echo "OK: certs/fullchain.pem y certs/privkey.pem generados (validos 365 dias, autofirmados para ${DOMAIN})"
echo "Para usarlo en el poller: MW_CA_CERT_PATH=./certs/fullchain.pem en .env"
