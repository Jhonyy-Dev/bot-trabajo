# 🔑 Guía de Configuración de APIs

## APIs Gratuitas (RECOMENDADAS)

### ✅ RemoteOK API
- **Costo:** GRATIS (sin API key necesaria)
- **Cobertura:** 100% trabajos remotos tech
- **Configuración:** Ya funciona automáticamente

### ✅ Arbeitnow API
- **Costo:** GRATIS (sin API key necesaria)
- **Cobertura:** Europa (Alemania, UK, España, etc.)
- **Configuración:** Ya funciona automáticamente

---

## APIs Premium (OPCIONALES)

### 🔸 JSearch API (RapidAPI)
**Beneficio:** Acceso a LinkedIn, Indeed, Glassdoor

1. Ir a: https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch
2. Crear cuenta gratis
3. Suscribirse al plan BASIC (gratis - 250 requests/mes)
4. Copiar tu API Key
5. Agregar en `.env`:
   ```
   RAPIDAPI_KEY=tu_api_key_aqui
   ```

### 🔸 USAJOBS API (Gobierno USA)
**Beneficio:** Trabajos de gobierno estadounidense

1. Ir a: https://developer.usajobs.gov/
2. Crear cuenta
3. Solicitar API Key
4. Agregar en `.env`:
   ```
   USAJOBS_API_KEY=tu_api_key_aqui
   USAJOBS_EMAIL=tu_email@ejemplo.com
   ```

---

## Configuración Mínima Funcional

**Solo necesitas tener configurado:**
```env
GEMINI_API_KEY=AIzaSy...  # Ya configurado
TARGET_GROUP_NAME=Club Dev Maval
```

**El bot funcionará con:**
- ✅ RemoteOK (gratis, sin key)
- ✅ Arbeitnow (gratis, sin key)

**Si agregas RAPIDAPI_KEY obtendrás también:**
- ✅ JSearch (LinkedIn, Indeed, Glassdoor)

---

## Testing

Prueba el sistema con:
```bash
npm start
```

El bot buscará automáticamente ofertas cada 12 horas usando las APIs disponibles.
