# 💼 Bot de Ofertas Laborales para WhatsApp

Bot de WhatsApp que busca, filtra y envía ofertas laborales tech a un grupo de WhatsApp cada 12 horas. Utiliza un **Sistema Híbrido** combinando múltiples APIs de empleo para máxima cobertura.

![Status](https://img.shields.io/badge/status-active-brightgreen)
![Node](https://img.shields.io/badge/node-%3E=20.0.0-339933?logo=node.js&logoColor=white)
![APIs](https://img.shields.io/badge/APIs-4%20sources-blue)

---

## 🚀 Características Principales

✅ **Sistema Híbrido Multi-API**
- JSearch API (LinkedIn, Indeed, Glassdoor)
- RemoteOK API (100% remoto, tech)
- Arbeitnow API (Europa, gratis)
- USAJOBS API (Gobierno USA, opcional)

✅ **Filtrado Inteligente**
- Nivel junior/trainee/entry-level
- Remoto y presencial
- Múltiples países
- Sin duplicados

✅ **Categorías Tech**
- 💻 Frontend Development
- ⚙️ Backend Development
- 📱 Mobile Development
- 🗄️ Database Administration
- 📊 Data Analysis
- 🔒 Cybersecurity

✅ **Automatización**
- Envío cada 12 horas exactas
- Rotación circular de categorías
- Persistencia entre reinicios
- Circuit breaker para errores

✅ **IA con Gemini**
- Redacción atractiva de ofertas
- Fallback inteligente sin IA
- Mensajes optimizados para WhatsApp

✅ **Dashboard Web Moderno**
- Escaneo de QR
- Envío manual
- Estadísticas en tiempo real
- Pruebas de búsqueda

---

## 📋 Requisitos

- Node.js 20+
- WhatsApp activo
- API Key de Gemini (obligatoria)
- RapidAPI Key (opcional pero recomendada)

---

## 🔧 Instalación Rápida

### 1. Clonar e instalar

```bash
cd BOT_TRABAJO
npm install
```

### 2. Configurar `.env`

```env
# OBLIGATORIO
GEMINI_API_KEY=tu_key_aqui
TARGET_GROUP_NAME=Club Dev Maval

# OPCIONAL (para más ofertas)
RAPIDAPI_KEY=tu_key_aqui
```

**Nota:** El bot funciona sin `RAPIDAPI_KEY` usando RemoteOK y Arbeitnow (gratis).

### 3. Iniciar el bot

```bash
npm start
```

### 4. Abrir dashboard

Navega a: **http://localhost:3000**

Escanea el QR con WhatsApp y listo! ✅

---

## 📊 APIs Utilizadas

### ✅ Gratuitas (Sin configuración)

| API | Cobertura | Costo |
|-----|-----------|-------|
| **RemoteOK** | 100% Remoto, Tech global | GRATIS |
| **Arbeitnow** | Europa (DE, UK, ES, etc.) | GRATIS |

### 🔸 Premium (Opcionales)

| API | Beneficio | Plan Gratis |
|-----|-----------|-------------|
| **JSearch** | LinkedIn, Indeed, Glassdoor | 250 requests/mes |
| **USAJOBS** | Trabajos gobierno USA | Ilimitado |

Ver [API_SETUP.md](./API_SETUP.md) para configuración detallada.

---

## 🎯 Configuración Avanzada

### Variables `.env` completas

```env
# ========== OFERTAS LABORALES ==========
JOB_CATEGORIES=frontend,backend,mobile,database,data-analyst,cybersecurity
JOB_LEVELS=junior,trainee,entry-level
JOB_LOCATIONS=remote,USA,Spain,Mexico,Argentina,Colombia,Chile
SEARCH_REMOTE_ONLY=false

# ========== APIs ==========
RAPIDAPI_KEY=                    # Opcional
USAJOBS_API_KEY=                 # Opcional
USAJOBS_EMAIL=                   # Opcional

# ========== WHATSAPP ==========
TARGET_GROUP_NAME=Club Dev Maval

# ========== GEMINI AI ==========
GEMINI_API_KEY=tu_key_aqui      # Obligatoria
```

### Personalización de categorías

Edita `job-scheduler.js` línea 24:

```javascript
this.jobCategories = ['FRONTEND', 'BACKEND', 'MOBILE', 'DATABASE', 'DATA_ANALYST', 'CYBERSECURITY'];
```

---

## 🌐 Endpoints API

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/` | Dashboard principal |
| GET | `/status` | Estado WhatsApp |
| GET | `/qr` | Código QR |
| POST | `/send-job-offer` | Enviar oferta manual |
| POST | `/search-jobs` | Probar búsqueda |
| GET | `/job-scheduler-status` | Estado del scheduler |
| GET | `/sent-jobs-history` | Historial de envíos |
| POST | `/logout` | Cerrar sesión WhatsApp |

---

## 💡 Uso del Dashboard

### Panel Principal

1. **Conectar WhatsApp**: Escanea el QR
2. **Próxima Categoría**: Muestra qué tipo de oferta se enviará
3. **Próximo Envío**: Countdown hasta el siguiente envío automático
4. **Enviar Ahora**: Botón para envío manual (respeta el límite de 12h)

### Probar Búsqueda

Busca ofertas sin enviarlas:
1. Selecciona categoría
2. Selecciona ubicación
3. Click "Buscar"
4. Revisa resultados

### Estadísticas

- Total de ofertas enviadas
- Categorías disponibles
- Estado de APIs

---

## 🔍 Ejemplo de Oferta Enviada

```
💻 *Frontend Developer (Junior)*

🏢 *Empresa:* Vercel Inc.
📍 *Ubicación:* 100% Remote 🌎
💰 *Salario:* $50,000 - $70,000 USD/año

📝 *Descripción:*
Buscamos desarrollador frontend junior con React y TypeScript. 
Trabajarás en proyectos open source con un equipo senior...

🎯 *Categoría:* Frontend

🔗 *Postula aquí:*
https://remoteok.com/remote-jobs/123456

📊 _Fuente: RemoteOK_
```

---

## 🛠️ Estructura del Proyecto

```
BOT_TRABAJO/
├── job-search-api.js        # Sistema híbrido multi-API
├── job-scheduler.js          # Scheduler cada 12h
├── gemini-ai.js              # Redacción con IA
├── modern-qr-server.js       # Servidor Express
├── whatsapp.js               # Cliente WhatsApp
├── public/
│   └── job-dashboard.html    # Dashboard moderno
├── .env                      # Configuración
├── job_schedule.json         # Persistencia scheduler
├── jobs_sent.json            # Historial de envíos
└── API_SETUP.md             # Guía de APIs
```

---

## 🚨 Solución de Problemas

### No encuentra ofertas

- Verifica que las APIs estén respondiendo
- Prueba con diferentes categorías
- Revisa la configuración en `.env`

### No envía automáticamente

- Verifica que WhatsApp esté conectado
- Revisa `/job-scheduler-status`
- Comprueba que hayan pasado 12 horas desde el último envío

### Error "Todas las ofertas ya fueron enviadas"

- El bot evita duplicados automáticamente
- Espera 12 horas para que encuentre nuevas ofertas
- O prueba con otra categoría manualmente

---

## 📈 Roadmap

- [ ] Selector de categoría en dashboard
- [ ] Filtro por salario mínimo
- [ ] Integración con más APIs (We Work Remotely, etc.)
- [ ] Notificaciones por email
- [ ] Múltiples grupos simultáneos
- [ ] Base de datos PostgreSQL
- [ ] Deploy en Railway/Heroku

---

## 🤝 Contribuciones

Las contribuciones son bienvenidas:

1. Fork el proyecto
2. Crea una rama (`git checkout -b feature/nueva-api`)
3. Commit cambios (`git commit -m 'Agregar nueva API'`)
4. Push a la rama (`git push origin feature/nueva-api`)
5. Abre un Pull Request

---

## 📝 Licencia

MIT License - uso libre

---

## 🙏 Créditos

- **APIs**: JSearch, RemoteOK, Arbeitnow, USAJOBS
- **WhatsApp**: Baileys
- **IA**: Google Gemini
- **UI**: TailwindCSS

---

**Hecho con ❤️ para ayudar a devs junior a encontrar trabajo**
