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

# curl ... | bash: script stdin'den aktiginda "read" stdin'i kirer; sifreleri her zaman TTY'den oku.
TTY="${TTY:-/dev/tty}"
if [[ ! -r "$TTY" ]]; then
  echo "Hata: ${TTY} okunamiyor. SSH oturumunda calistirin veya scripti indirip: bash berqenas-one-liner-bootstrap.sh" >&2
  exit 1
fi

# set -u: bos cevaplarda bile atanmis olsun
PGPW="" PGAEM="" PGAPW="" AUTHPW="" GHTOK=""

echo "=== Berqenas / RetailEX — tam kurulum ==="
read -rsp "PostgreSQL kullanici 'postgres' sifresi: " PGPW <"$TTY"
echo
read -rp "pgAdmin e-posta: " PGAEM <"$TTY"
read -rsp "pgAdmin sifresi: " PGAPW <"$TTY"
echo
read -rsp "PostgreSQL rol 'authenticator' sifresi (PostgREST): " AUTHPW <"$TTY"
echo
read -rsp "GitHub PAT (repo private ise; public ise Enter): " GHTOK <"$TTY"
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
chmod +x berqenas-saas-from-zero.sh berqenas-vps-full-paste.sh berqenas-deploy-web.sh \
  berqenas-vps-fresh-install-all.sh berqenas-caddy-merge-merkez-api.sh \
  berqenas-deploy-exfinpdks-web.sh 2>/dev/null || true

export POSTGRES_PASSWORD="${PGPW}"
export PGADMIN_DEFAULT_EMAIL="${PGAEM}"
export PGADMIN_DEFAULT_PASSWORD="${PGAPW}"
export AUTHENTICATOR_PASSWORD="${AUTHPW}"
export RETAILEX_GIT_URL="${REPO_HTTPS}"

exec bash "${TARGET_DIR}/database/scripts/berqenas-vps-fresh-install-all.sh"
