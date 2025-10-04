# 🚂 Configuración de Railway

## ⚠️ IMPORTANTE: Crear Volume para Persistencia

Railway borra los archivos cuando el contenedor se reinicia. Para mantener el historial de ofertas enviadas, debes crear un **Volume**.

### 📋 Pasos:

1. **Abre tu proyecto en Railway**
   - Ve a: https://railway.app/dashboard

2. **Selecciona el servicio `bot-trabajo`**

3. **Ve a la pestaña "Settings"**

4. **Scroll hasta "Volumes"**

5. **Click en "+ New Volume"**
   - **Mount Path:** `/data`
   - Click en "Add"

6. **Redeploy el servicio**
   - Ve a "Deployments"
   - Click en "Redeploy"

---

## ✅ Verificación

Después de crear el Volume, los archivos se guardarán en `/data`:
- `/data/job_schedule.json` - Horarios de envío
- `/data/jobs_sent.json` - Historial de ofertas enviadas

Estos archivos **NO se borrarán** cuando Railway reinicie el contenedor.

---

## 🔍 Alternativa: Variables de Entorno

Si no quieres usar Volumes, otra opción es usar una base de datos como:
- **Railway PostgreSQL** (gratis)
- **MongoDB Atlas** (gratis)
- **Redis** (Railway ofrece plan gratis)

Pero por ahora, **el Volume es la solución más simple**.
