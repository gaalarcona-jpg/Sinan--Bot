#!/bin/sh
# Script de deploy automatico para sinan-crm en Railway
# Uso: RAILWAY_TOKEN=xxx sh deploy.sh

set -e

echo "=== SINAN CRM Deploy ==="

# 1. Verificar auth
railway whoami

# 2. Linkear al proyecto clever-intuition
railway link --project clever-intuition

# 3. Crear servicio nuevo sinan-crm (si no existe)
railway service create sinan-crm 2>/dev/null || echo "Servicio ya existe"

# 4. Seleccionar servicio
railway service sinan-crm

# 5. Configurar variables de entorno
railway variables set \
  DATABASE_URL="$(railway variables get DATABASE_URL --service sinan-bot 2>/dev/null)" \
  JWT_SECRET="ac6290cb5a225b229b7dc5720fed97846da73af8cdcc694be9a7e2ea209efe16" \
  CRM_GIT_TAG="crm-v1.0-$(date +%Y-%m-%d)" \
  NODE_ENV="production"

# 6. Deploy desde directorio crm/
railway up --service sinan-crm --detach

echo "Deploy iniciado. Ver estado en: https://railway.app/project/clever-intuition"
