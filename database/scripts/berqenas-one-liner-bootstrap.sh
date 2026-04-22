#!/usr/bin/env bash
# Ubuntu (root): apt guncelle, sifreleri sor, repoyu cek, SaaS yiginini kur.
# Tek satir (repo public ve raw erisim aciksa):
#   curl -fsSL https://raw.githubusercontent.com/ferhatdeveloper/RetailEX/main/database/scripts/berqenas-one-liner-bootstrap.sh | bash
# Private repo: once bu dosyayi VPS'e atin veya manuel klon + asagidaki "yerel" akis.
#
set -euo pipefail

REPO_HTTPS="${REPO_HTTPS:-https://github.com/ferhatdeveloper/RetailEX.git}"
REPO_SSH="${REPO_SSH:-git@github.com:ferhatdeveloper/RetailEX.git}"
INSTALL_ROOT="${INSTALL_ROOT:-/opt}"
TARGET_DIR="${TARGET_DIR:-${INSTALL_ROOT}/RetailEX}"

echo "=== Berqenas / RetailEX — tam kurulum ==="
read -rsp "PostgreSQL kullanici 'postgres' sifresi: " PGPW
echo
read -rp "pgAdmin e-posta: " PGAEM
read -rsp "pgAdmin sifresi: " PGAPW
echo
read -rsp "PostgreSQL rol 'authenticator' sifresi (PostgREST): " AUTHPW
echo
read -rsp "GitHub PAT (repo private ise; public ise Enter): " GHTOK
echo

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y git curl ca-certificates

mkdir -p "${INSTALL_ROOT}"
cd "${INSTALL_ROOT}"

if [[ -d "${TARGET_DIR}/.git" ]]; then
  echo "=== Git pull: ${TARGET_DIR} ==="
  git -C "${TARGET_DIR}" pull origin main || git -C "${TARGET_DIR}" pull
else
  echo "=== Git clone ==="
  if [[ -n "${GHTOK}" ]]; then
    # fine-grained PAT: https://TOKEN@github.com/owner/repo.git
    git clone "https://ferhatdeveloper:${GHTOK}@github.com/ferhatdeveloper/RetailEX.git" "${TARGET_DIR}"
  else
    git clone "${REPO_HTTPS}" "${TARGET_DIR}" || {
      echo "HTTPS basarisiz; SSH deneniyor (anahtar GitHub'a ekli olmali)..." >&2
      git clone "${REPO_SSH}" "${TARGET_DIR}"
    }
  fi
fi

cd "${TARGET_DIR}/database/scripts"
chmod +x berqenas-saas-from-zero.sh berqenas-vps-full-paste.sh berqenas-deploy-web.sh

export POSTGRES_PASSWORD="${PGPW}"
export PGADMIN_DEFAULT_EMAIL="${PGAEM}"
export PGADMIN_DEFAULT_PASSWORD="${PGAPW}"
export AUTHENTICATOR_PASSWORD="${AUTHPW}"
export RETAILEX_GIT_URL="${REPO_HTTPS}"

exec bash "${TARGET_DIR}/database/scripts/berqenas-saas-from-zero.sh"
