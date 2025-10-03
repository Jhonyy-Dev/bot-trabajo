# 🚀 INICIO RÁPIDO - Bot de Ofertas Laborales

## ⚡ 3 Pasos para Comenzar

### 1️⃣ Instalar Dependencias

```bash
npm install
```

### 2️⃣ Verificar `.env`

Tu archivo `.env` ya está configurado. Solo necesitas:

✅ **GEMINI_API_KEY** - Ya configurada
✅ **TARGET_GROUP_NAME** - Club Dev Maval

**OPCIONAL** (para más ofertas):
- `RAPIDAPI_KEY` - Agrega para acceder a LinkedIn/Indeed/Glassdoor
- Ver `API_SETUP.md` para obtener claves gratis

### 3️⃣ Iniciar el Bot

```bash
npm start
```

Abre: **http://localhost:3000**

---

## ✅ Verificar que Funciona

### Prueba las APIs (sin WhatsApp)

```bash
npm run test-jobs
```

Esto buscará ofertas reales en:
- RemoteOK (100% remoto)
- Arbeitnow (Europa)
- JSearch (si tienes RAPIDAPI_KEY)

### Conectar WhatsApp

1. Abre http://localhost:3000
2. Escanea el QR con WhatsApp
3. Espera confirmación "✅ Conectado"

### Enviar Oferta Manual

En el dashboard:
1. Click "🚀 Enviar Oferta Laboral Ahora"
2. Verifica el grupo de WhatsApp
3. Deberías recibir una oferta en formato bonito

---

## 📋 Categorías que se Rotan

El bot envía automáticamente cada 12 horas en este orden:

1. 💻 **Frontend** (React, Vue, Angular)
2. ⚙️ **Backend** (Node, Python, Java)
3. 📱 **Mobile** (iOS, Android, React Native)
4. 🗄️ **Database** (SQL, DBA)
5. 📊 **Data Analyst** (BI, Analytics)
6. 🔒 **Cybersecurity** (InfoSec, Security)

---

## 🎯 Próximos Pasos

### Conseguir Más Ofertas (Opcional)

1. Regístrate en RapidAPI: https://rapidapi.com
2. Suscríbete a JSearch (250 requests gratis/mes)
3. Copia tu API Key
4. Agrégala en `.env`:
   ```
   RAPIDAPI_KEY=tu_key_aqui
   ```
5. Reinicia el bot: `npm start`

### Personalizar

- **Cambiar grupo:** Edita `TARGET_GROUP_NAME` en `.env`
- **Cambiar categorías:** Edita `job-scheduler.js` línea 24
- **Cambiar intervalo:** Edita `job-scheduler.js` línea 11 (no recomendado)

---

## 🆘 Problemas Comunes

### "No se encontraron ofertas"

- **Causa:** APIs temporalmente sin resultados
- **Solución:** Espera unos minutos o prueba otra categoría

### QR no aparece

- **Causa:** Archivos de sesión corruptos
- **Solución:** Cierra sesión desde el dashboard y recarga

### "Error de Gemini AI"

- **Causa:** API key inválida o cuota excedida
- **Solución:** El bot usará descripciones automáticas (funciona igual)

---

## 📊 Verificar Estado

### Dashboard: http://localhost:3000

- ✅ Estado WhatsApp
- ⏰ Próximo envío programado
- 📝 Historial de ofertas
- 🔍 Probar búsquedas

### API Endpoints

```bash
# Estado del scheduler
curl http://localhost:3000/job-scheduler-status

# Historial de envíos
curl http://localhost:3000/sent-jobs-history

# Buscar ofertas (sin enviar)
curl -X POST http://localhost:3000/search-jobs \
  -H "Content-Type: application/json" \
  -d '{"category":"FRONTEND","location":"remote"}'
```

---

## 🎉 ¡Listo!

Tu bot está enviando ofertas laborales tech cada 12 horas.

**Revisa:**
- 📖 `README_JOBS.md` - Documentación completa
- 🔑 `API_SETUP.md` - Configuración de APIs
- 💻 Dashboard - http://localhost:3000

**Ayuda:**
- GitHub Issues
- Telegram: @tu_usuario
- Email: tu@email.com
