// Servidor Express para manejar el bot de WhatsApp con QR moderno
const express = require('express');
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const P = require('pino');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');
const http = require('http');
// Importar sistema de ofertas laborales
const { jobScheduler, getSchedulerStatus: getJobSchedulerStatus } = require('./job-scheduler');
const { searchJobOffers, getJobStatistics } = require('./job-search-api');
const { enhanceJobDescription } = require('./gemini-ai');

require('dotenv').config();

// Validar configuración crítica al inicio
function validateConfiguration() {
  const requiredVars = {
    'GEMINI_API_KEY': process.env.GEMINI_API_KEY,
    'TARGET_GROUP_NAME': process.env.TARGET_GROUP_NAME
  };

  const missing = [];

  for (const [key, value] of Object.entries(requiredVars)) {
    if (!value || value.trim() === '') {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    console.error('❌ ERROR CRÍTICO: Faltan variables de entorno obligatorias:');
    missing.forEach(key => console.error(`   - ${key}`));
    console.error('\n📝 Configura estas variables en el archivo .env');
    process.exit(1);
  }

  console.log('✅ Configuración validada correctamente');
  console.log('💼 Bot de Ofertas Laborales - Sistema Híbrido');
  console.log(`🎯 Grupo objetivo: ${process.env.TARGET_GROUP_NAME}`);
  console.log('🔄 APIs: RemoteOK, Arbeitnow' + (process.env.RAPIDAPI_KEY ? ', JSearch (LinkedIn/Indeed)' : '') + (process.env.USAJOBS_API_KEY ? ', USAJOBS' : ''));
}

// Ejecutar validación al inicio
validateConfiguration();

// Función para limpiar archivos de autenticación
function cleanAuthFiles() {
  const authPath = path.join(__dirname, 'auth');
  if (fs.existsSync(authPath)) {
    try {
      const files = fs.readdirSync(authPath);
      let deletedCount = 0;
      
      for (const file of files) {
        const filePath = path.join(authPath, file);
        try {
          fs.chmodSync(filePath, 0o666);
          fs.unlinkSync(filePath);
          deletedCount++;
        } catch (fileError) {
          // Intentar con PowerShell como fallback
          try {
            const { exec } = require('child_process');
            exec(`powershell -Command "Remove-Item -Path '${filePath}' -Force"`, (error) => {
              if (!error) deletedCount++;
            });
          } catch (psError) {
            // Silencioso
          }
        }
      }
      
      if (deletedCount > 0) {
        console.log(`🗑️ Archivos de autenticación limpiados (${deletedCount} archivos)`);
      }
    } catch (cleanError) {
      console.error('❌ Error limpiando archivos auth:', cleanError);
    }
  }
}

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Array para almacenar conexiones SSE
let sseClients = [];

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Variables globales para el estado de WhatsApp
let sock = null;
let qrString = '';
let isReady = false;
let connectionStatus = 'disconnected';
let qrGeneratedAt = null;
let qrTimeout = null;
let connectedUser = null;
let isReconnecting = false; // Prevenir reconexiones múltiples
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// Variable para prevenir envíos simultáneos
let isCurrentlySending = false;

// Variable para rotación secuencial de temas
let currentTopicIndex = 0;

// Función para enviar eventos SSE a todos los clientes conectados
function broadcastSSE(event, data) {
  sseClients.forEach((client, index) => {
    try {
      client.write(`event: ${event}\n`);
      client.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (error) {
      console.error(`❌ Error enviando SSE:`, error.message);
    }
  });
}

// Función para limpiar archivos de sesión antiguos
async function cleanupOldSessionFiles() {
  try {
    const fs = require('fs').promises;
    const path = require('path');
    const authDir = path.join(process.cwd(), 'auth');
    
    const files = await fs.readdir(authDir);
    const sessionFiles = files.filter(file => file.startsWith('session-') && file.endsWith('.json'));
    
    if (sessionFiles.length > 100) {
      // Mantener solo los 50 archivos más recientes
      const filesToDelete = sessionFiles.slice(0, sessionFiles.length - 50);
      
      for (const file of filesToDelete) {
        try {
          await fs.unlink(path.join(authDir, file));
        } catch (err) {
          // Silencioso si no se puede eliminar
        }
      }
      
      console.log(`🗑️ Archivos de sesión limpiados (${filesToDelete.length} archivos)`);
    }
  } catch (error) {
    // Silencioso - no afectar funcionamiento
  }
}

// Función para inicializar el cliente de WhatsApp con Baileys
async function initializeWhatsApp() {
  try {
    // Limpiar archivos de sesión antiguos antes de iniciar
    await cleanupOldSessionFiles();
    
    const { state, saveCreds } = await useMultiFileAuthState('auth');
    authState = { state, saveCreds };
    
    sock = makeWASocket({
      auth: state,
      logger: P({ level: 'fatal' }),
      printQRInTerminal: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 60000,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      fireInitQueries: false,
      generateHighQualityLinkPreview: false,
      shouldIgnoreJid: () => false,
      shouldSyncHistoryMessage: () => false,
      patchMessageBeforeSending: (message) => {
        const requiresPatch = !!(
          message.buttonsMessage ||
          message.templateMessage ||
          message.listMessage
        );
        if (requiresPatch) {
          message = {
            viewOnceMessage: {
              message: {
                messageContextInfo: {
                  deviceListMetadataVersion: 2,
                  deviceListMetadata: {},
                },
                ...message,
              },
            },
          };
        }
        return message;
      }
    });

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        qrString = await qrcode.toDataURL(qr);
        qrGeneratedAt = Date.now();
        
        // Limpiar timeout anterior si existe
        if (qrTimeout) {
          clearTimeout(qrTimeout);
        }
        
        // Enviar nuevo QR a todos los clientes conectados
        broadcastSSE('qr-update', { qr: qrString });
      }
      
      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
        const statusCode = (lastDisconnect?.error)?.output?.statusCode;
        
        // Limpiar referencia global inmediatamente
        global.waSocket = null;
        isReady = false;
        connectionStatus = 'disconnected';
        
        // Evitar reconexiones múltiples simultáneas
        if (isReconnecting) {
          console.log('⏳ Ya hay una reconexión en progreso, ignorando...');
          return;
        }
        
        if (shouldReconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          isReconnecting = true;
          reconnectAttempts++;
          
          const delay = Math.min(10000 * reconnectAttempts, 30000); // Max 30 segundos
          console.log(`🔄 Reconectando WhatsApp en ${delay/1000} segundos... (intento ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
          
          setTimeout(() => {
            isReconnecting = false;
            initializeWhatsApp();
          }, delay);
        } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          console.log('❌ Máximo de intentos de reconexión alcanzado. Esperando 5 minutos...');
          reconnectAttempts = 0;
          isReconnecting = false;
          
          setTimeout(() => {
            initializeWhatsApp();
          }, 300000); // 5 minutos
        } else {
          connectionStatus = 'disconnected';
          connectedUser = null;
          qrString = '';
          reconnectAttempts = 0;
          isReconnecting = false;
          
          console.log('🚪 Sesión cerrada por el usuario');
          broadcastSSE('session-closed', { message: 'Sesión cerrada desde celular' });
          
          // Reiniciar después de 30 segundos
          setTimeout(async () => {
            try {
              await initializeWhatsApp();
            } catch (error) {
              console.log('Error reiniciando:', error.message);
            }
          }, 30000);
        }
      } else if (connection === 'open') {
        isReady = true;
        connectionStatus = 'connected';
        qrString = '';
        reconnectAttempts = 0; // Reset contador en conexión exitosa
        isReconnecting = false;
        
        // Establecer referencia global inmediatamente
        global.waSocket = sock;
        
        console.log('✅ WhatsApp conectado exitosamente');
        
        // Limpiar timeout de QR ya que se conectó exitosamente
        if (qrTimeout) {
          clearTimeout(qrTimeout);
          qrTimeout = null;
        }
        
        // Obtener información del usuario
        setTimeout(async () => {
          try {
            if (sock && sock.user) {
              // Intentar obtener el nombre del perfil
              let userName = 'Usuario WhatsApp';
              try {
                // Método 1: Obtener pushName del usuario
                if (sock.user.name) {
                  userName = sock.user.name;
                  console.log(`📝 Nombre obtenido de sock.user.name: ${userName}`);
                } else {
                  // Método 2: Obtener información del perfil
                  try {
                    const userInfo = await sock.onWhatsApp(sock.user.id);
                    if (userInfo && userInfo[0] && userInfo[0].name) {
                      userName = userInfo[0].name;
                      console.log(`📝 Nombre obtenido de onWhatsApp: ${userName}`);
                    }
                  } catch (e) {
                    console.log('onWhatsApp falló, intentando getBusinessProfile...');
                  }
                  
                  // Método 3: Obtener desde perfil de negocio
                  if (userName === 'Usuario WhatsApp') {
                    try {
                      const contacts = await sock.getBusinessProfile(sock.user.id);
                      if (contacts && contacts.description) {
                        userName = contacts.description;
                        console.log(`📝 Nombre obtenido de BusinessProfile: ${userName}`);
                      }
                    } catch (e) {
                      console.log('getBusinessProfile falló');
                    }
                  }
                }
                
                // Solo mostrar nombre final en primera conexión
              if (!global.finalNameLogged) {
                console.log(`📝 Nombre final seleccionado: ${userName}`);
                global.finalNameLogged = true;
              }
              } catch (nameError) {
                console.log('❌ Error obteniendo nombre del perfil:', nameError.message);
                userName = sock.user.name || 'Usuario WhatsApp';
              }
              
              connectedUser = {
                name: userName,
                phone: sock.user.id.split(':')[0],
                id: sock.user.id,
                connected_at: new Date().toISOString()
              };
              broadcastSSE('user-connected', { 
                status: 'connected',
                user: connectedUser 
              });

              // Establecer referencia global para el JobScheduler
              global.waSocket = sock;
              
              // Verificar si ya es tiempo de enviar una oferta (solo en primera conexión)
              if (!global.hasConnectedBefore) {
                console.log('✅ Primera conexión - Verificando scheduler de ofertas laborales...');
                global.hasConnectedBefore = true;
                
                setTimeout(async () => {
                  try {
                    const status = await getJobSchedulerStatus();
                    
                    if (status && status.canSend) {
                      console.log('🚀 Enviando primera oferta laboral...');
                      await jobScheduler.manualSend();
                      console.log('✅ Primera oferta enviada - Próximo envío en 12 horas');
                    } else {
                      const nextTime = status?.nextAllowedTime || 'desconocido';
                      console.log(`⏰ Próxima oferta programada para: ${nextTime}`);
                    }
                  } catch (error) {
                    console.error('❌ Error verificando scheduler:', error.message);
                  }
                }, 3000);
              } else {
                console.log('✅ Reconectado - Scheduler activo en segundo plano');
              }
            }
          } catch (userError) {
            console.log('❌ Error obteniendo información de usuario:', userError.message);
          }
        }, 3000);
      }
    });

    sock.ev.on('creds.update', authState.saveCreds);
    
    // Limpiar archivos de sesión cada 12 horas para mantener memoria controlada
    setInterval(async () => {
      await cleanupOldSessionFiles();
    }, 12 * 60 * 60 * 1000);
    
  } catch (error) {
    console.error('Error inicializando cliente WhatsApp:', error);
    connectionStatus = 'error';
  }

}

// Rutas del servidor
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'job-dashboard.html'));
});

// Ruta alternativa para el dashboard antiguo
app.get('/old-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'modern-qr.html'));
});

// Ruta para obtener el código QR
app.get('/qr', async (req, res) => {
  try {
    if (qrString && typeof qrString === 'string' && qrString.length > 0 && qrString.length < 2000) {
      const qrDataUrl = await qrcode.toDataURL(qrString);
      res.json({ success: true, qr: qrDataUrl });
    } else {
      res.json({ success: false, message: 'No hay código QR disponible' });
    }
  } catch (error) {
    console.error('Error generando QR:', error);
    qrString = ''; // Limpiar QR corrupto
    res.status(500).json({ success: false, message: 'Error generando QR' });
  }
});

app.get('/status', (req, res) => {
  try {
    res.setHeader('Content-Type', 'application/json');
    res.json({
      isReady,
      status: connectionStatus,
      hasQR: !!qrString,
      user: connectedUser
    });
  } catch (error) {
    console.error('Error en endpoint /status:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor'
    });
  }
});

// Función mejorada para buscar y enviar YouTube Short con anti-repetición de canales
async function sendYouTubeShort() {
  console.log('🎬 INICIANDO sendYouTubeShort()');
  
  if (!isReady) {
    console.log('❌ Cliente de WhatsApp no está listo');
    console.log('Estado actual:', { isReady, connectionStatus, sock: !!sock });
    return { success: false, message: 'Cliente no está listo' };
  }
  
  console.log('✅ Cliente listo, continuando con envío...');

  try {
    const targetGroupName = process.env.TARGET_GROUP_NAME;
    if (!targetGroupName) {
      throw new Error('TARGET_GROUP_NAME no está configurado en .env');
    }

    // Buscar el grupo objetivo usando Baileys
    console.log('🔍 Buscando grupo objetivo:', targetGroupName);
    const chats = await sock.groupFetchAllParticipating();
    const groups = Object.values(chats);
    const targetGroup = groups.find(group => 
      group.subject && group.subject.toLowerCase().includes(targetGroupName.toLowerCase())
    );

    if (!targetGroup) {
      console.error('❌ No se encontró el grupo:', targetGroupName);
      throw new Error(`No se encontró el grupo: ${targetGroupName}`);
    }

    console.log(`✅ Grupo encontrado: ${targetGroup.subject}`);

    // Obtener temas desde variables de entorno
    const topicsFromEnv = process.env.YOUTUBE_TOPIC;
    if (!topicsFromEnv) {
      throw new Error('YOUTUBE_TOPIC no está configurado en .env');
    }

    const availableTopics = topicsFromEnv.split(',').map(topic => topic.trim());
    
    // Seleccionar tema SECUENCIAL (rotación circular)
    const currentTopic = availableTopics[currentTopicIndex];
    console.log(`🎯 Tema secuencial [${currentTopicIndex + 1}/${availableTopics.length}]: ${currentTopic}`);
    
    // Avanzar al siguiente tema para el próximo envío
    currentTopicIndex = (currentTopicIndex + 1) % availableTopics.length;

    let video = null;
    let allFoundVideos = [];
    const attemptedTopics = [];

    // LOGS DETALLADOS PARA DEBUG
    console.log(`🔍 ESTADO ACTUAL DE MEMORIA:`);
    console.log(`📝 Videos enviados (${sentVideos.length}):`, sentVideos.slice(-5)); // Últimos 5
    console.log(`🏷️ Canales enviados (${sentChannels.length}):`, sentChannels.slice(-3)); // Últimos 3
    
    // BÚSQUEDA PRINCIPAL: Tema actual con filtro de canales
    console.log(`🔍 BÚSQUEDA PRINCIPAL: ${currentTopic}`);
    const foundVideos = await searchYouTubeShorts(currentTopic);
    attemptedTopics.push(currentTopic);
    
    if (foundVideos && foundVideos.length > 0) {
      // FILTRO ANTI-REPETICIÓN: Eliminar videos ya enviados
      const newVideos = foundVideos.filter(v => !sentVideos.includes(v.id) && !sentChannels.includes(v.channelId));
      
      console.log(`📹 Videos encontrados: ${foundVideos.length}`);
      console.log(`✅ Videos nuevos (no repetidos): ${newVideos.length}`);
      
      // LOG DETALLADO DE FILTRADO
      if (foundVideos.length > 0 && newVideos.length === 0) {
        console.log(`⚠️ TODOS LOS VIDEOS YA FUERON ENVIADOS:`);
        foundVideos.slice(0, 3).forEach((v, i) => {
          const videoRepeated = sentVideos.includes(v.id);
          const channelRepeated = sentChannels.includes(v.channelId);
          console.log(`   ${i+1}. "${v.title}" - Video repetido: ${videoRepeated}, Canal repetido: ${channelRepeated}`);
        });
      }
      
      if (newVideos.length > 0) {
        video = newVideos[Math.floor(Math.random() * newVideos.length)];
        console.log(`✅ VIDEO NUEVO SELECCIONADO: "${video.title}" - Canal: "${video.channelTitle}"`);
        console.log(`🆔 Video ID: ${video.id}, Canal ID: ${video.channelId}`);
        allFoundVideos.push(video);
      } else {
        allFoundVideos.push(...foundVideos);
      }
    }

    // BÚSQUEDA DE RESPALDO: Si no encontramos video de canal nuevo
    if (!video) {
      console.log(`🔄 INICIANDO BÚSQUEDA DE RESPALDO...`);
      const maxBackupAttempts = Math.min(3, availableTopics.length - 1);
      
      for (let i = 0; i < maxBackupAttempts && !video; i++) {
        // Seleccionar tema de respaldo ALEATORIO diferente al ya intentado
        let backupTopic;
        let attempts = 0;
        do {
          const randomIndex = Math.floor(Math.random() * availableTopics.length);
          backupTopic = availableTopics[randomIndex];
          attempts++;
        } while (attemptedTopics.includes(backupTopic) && attempts < 10);
        
        if (attemptedTopics.includes(backupTopic)) {
          continue;
        }
        
        console.log(`🔄 Respaldo ALEATORIO ${i + 1}: ${backupTopic}`);
        attemptedTopics.push(backupTopic);
        const backupVideos = await searchYouTubeShorts(backupTopic);
        
        if (backupVideos && backupVideos.length > 0) {
          // FILTRO ANTI-REPETICIÓN para respaldo
          const newBackupVideos = backupVideos.filter(v => !sentVideos.includes(v.id) && !sentChannels.includes(v.channelId));
          
          if (newBackupVideos.length > 0) {
            video = newBackupVideos[Math.floor(Math.random() * newBackupVideos.length)];
            console.log(`✅ RESPALDO NUEVO: "${video.title}" - Canal: "${video.channelTitle}"`);
            allFoundVideos.push(video);
            break;
          } else {
            allFoundVideos.push(...backupVideos);
          }
        }
      }
    }

    // SISTEMA CONSOLIDADO DE FALLBACK CON ANTI-REPETICIÓN ESTRICTA
    if (!video && allFoundVideos.length > 0) {
      console.log(`🚨 ACTIVANDO SISTEMA DE FALLBACK CONSOLIDADO`);
      
      // 1. Filtrar videos que ya hemos enviado
      const notRepeatedVideos = allFoundVideos.filter(v => !sentVideos.includes(v.id));
      
      // 2. De los no repetidos, filtrar canales que no hemos usado recientemente
      const newChannelVideos = notRepeatedVideos.filter(v => !sentChannels.includes(v.channelId));
      
      console.log(`📊 Videos totales encontrados: ${allFoundVideos.length}`);
      console.log(`📊 Videos no repetidos: ${notRepeatedVideos.length}`);
      console.log(`✅ Videos de canales nuevos: ${newChannelVideos.length}`);
      
      // PRIORIDAD 1: Videos de canales nuevos (nunca repetidos)
      if (newChannelVideos.length > 0) {
        video = newChannelVideos[Math.floor(Math.random() * newChannelVideos.length)];
        console.log(`✅ FALLBACK CANAL NUEVO: "${video.title}" - Canal: "${video.channelTitle}"`);
      }
      // PRIORIDAD 2: Videos no repetidos (aunque el canal sea conocido)
      else if (notRepeatedVideos.length > 0) {
        video = notRepeatedVideos[Math.floor(Math.random() * notRepeatedVideos.length)];
        console.log(`⚠️ FALLBACK CANAL CONOCIDO: "${video.title}" - Canal: "${video.channelTitle}"`);
      }
      // NO MÁS FALLBACK REPETIDO - RECHAZAR SI TODO ESTÁ REPETIDO
      else {
        console.log(`🚫 TODOS LOS VIDEOS YA FUERON ENVIADOS - NO HAY CONTENIDO NUEVO DISPONIBLE`);
        throw new Error('No hay videos nuevos disponibles. Todos los videos encontrados ya fueron enviados recientemente.');
      }
    }

    // VERIFICACIÓN FINAL ANTES DE ENVÍO
    if (!video) {
      throw new Error('No se encontraron videos nuevos disponibles. Intenta más tarde cuando haya contenido fresco.');
    }

    // VERIFICACIÓN CRÍTICA: Asegurar que el video seleccionado NO esté repetido
    if (sentVideos.includes(video.id)) {
      console.log(`🚫 CRÍTICO: Video ${video.id} ya fue enviado. Cancelando envío.`);
      throw new Error(`El video "${video.title}" ya fue enviado recientemente. No se pueden enviar videos repetidos.`);
    }

    if (sentChannels.includes(video.channelId)) {
      console.log(`⚠️ ADVERTENCIA: Canal ${video.channelId} ya fue usado recientemente, pero permitiendo video nuevo del mismo canal.`);
    }

    console.log(`📥 Descargando video: ${video.url}`);
    const outputPath = path.join(__dirname, 'downloads', `${video.id}.mp4`);
    
    try {
      await downloadYouTubeShort(video.url, outputPath);
      
      if (!fs.existsSync(outputPath)) {
        throw new Error('El archivo de video no se creó');
      }
      
      const stats = fs.statSync(outputPath);
      if (stats.size < 10000) {
        throw new Error('El archivo descargado es demasiado pequeño');
      }
      
      console.log(`✅ Video descargado correctamente: ${Math.round(stats.size / 1024)} KB`);
    } catch (downloadError) {
      console.error(`❌ Error descargando video: ${downloadError.message}`);
      throw new Error(`No se pudo descargar el video: ${downloadError.message}`);
    }

    // Generar descripción mejorada con Gemini AI
    let enhancedDescription;
    try {
      const { enhanceDescription } = require('./gemini-ai');
      enhancedDescription = await enhanceDescription(video.title, video.description, video.topic);
    } catch (geminiError) {
      // Silenciar errores de Gemini AI para reducir ruido en logs
      enhancedDescription = `🎬 *${video.title}*\n\n📺 Canal: ${video.channelTitle || 'Canal desconocido'}\n\n${video.description || 'Video sobre ' + video.topic}`;
    }

    // Leer el archivo de video descargado
    const videoBuffer = fs.readFileSync(outputPath);
    
    // Enviar video como archivo
    await sock.sendMessage(targetGroup.id, {
      video: videoBuffer,
      caption: enhancedDescription,
      mimetype: 'video/mp4'
    });
    
    // SISTEMA ROBUSTO ANTI-REPETICIÓN - REGISTRAR INMEDIATAMENTE TRAS ENVÍO EXITOSO
    if (video.id && !sentVideos.includes(video.id)) {
      sentVideos.push(video.id);
      if (sentVideos.length > MAX_SENT_VIDEOS_MEMORY) {
        sentVideos = sentVideos.slice(-MAX_SENT_VIDEOS_MEMORY);
      }
      console.log(`📝 ✅ Video ${video.id} REGISTRADO. Total videos recordados: ${sentVideos.length}`);
    } else if (video.id) {
      console.log(`⚠️ Video ${video.id} YA ESTABA REGISTRADO`);
    }
    
    if (video.channelId && !sentChannels.includes(video.channelId)) {
      sentChannels.push(video.channelId);
      if (sentChannels.length > MAX_SENT_CHANNELS_MEMORY) {
        sentChannels = sentChannels.slice(-MAX_SENT_CHANNELS_MEMORY);
      }
      console.log(`🏷️ ✅ Canal ${video.channelId} REGISTRADO. Total canales recordados: ${sentChannels.length}`);
    } else if (video.channelId) {
      console.log(`⚠️ Canal ${video.channelId} YA ESTABA REGISTRADO`);
    }
    
    // LOG FINAL DEL ESTADO DE MEMORIA
    console.log(`🔍 ESTADO FINAL DE MEMORIA:`);
    console.log(`📝 Videos: [${sentVideos.slice(-3).join(', ')}]`);
    console.log(`🏷️ Canales: [${sentChannels.slice(-3).join(', ')}]`);
    console.log(`📊 Memoria utilizada: ${sentVideos.length}/${MAX_SENT_VIDEOS_MEMORY} videos, ${sentChannels.length}/${MAX_SENT_CHANNELS_MEMORY} canales`);
    
    console.log(`✅ Video enviado: "${video.title}" - ${video.channelTitle}`);
    
    // Eliminar el archivo después de enviarlo
    try { 
      fs.unlinkSync(outputPath); 
      console.log('📁 Archivo temporal eliminado');
    } catch (e) { 
      console.log('⚠️ No se pudo eliminar archivo temporal:', e.message);
    }
    
    return { 
      success: true, 
      message: 'YouTube Short enviado correctamente', 
      video: {
        title: video.title,
        username: video.username,
        channelId: video.channelId,
        topic: video.topic,
        publishedAt: video.publishedAt
      }
    };

  } catch (error) {
    console.error('Error enviando YouTube Short:', error);
    
    // Enviar mensaje de error al grupo como fallback
    try {
      if (isReady && sock) {
        const targetGroupName = process.env.TARGET_GROUP_NAME;
        const chats = await sock.groupFetchAllParticipating();
        const groups = Object.values(chats);
        const targetGroup = groups.find(group => group.subject && group.subject.toLowerCase().includes(targetGroupName.toLowerCase()));
        
        if (targetGroup) {
          await sock.sendMessage(targetGroup.id, { text: `❌ Error enviando video: ${error.message}` });
        }
      }
    } catch (fallbackError) {
      console.error('Error enviando mensaje de fallback:', fallbackError);
    }
    
    return { success: false, message: error.message };
  }
}

// Ruta para enviar YouTube Short manualmente desde la web
app.post('/send-youtube-short', async (req, res) => {
  console.log('🚀 INICIO - Solicitud de envío de video recibida desde interfaz web');
  console.log('📱 Estado del cliente:', { isReady, connectionStatus, sockExists: !!sock });
  console.log('👤 Usuario conectado:', connectedUser);
  
  // PREVENIR ENVÍOS SIMULTÁNEOS
  if (isCurrentlySending) {
    console.log('⚠️ ENVÍO YA EN PROGRESO - Rechazando solicitud duplicada');
    return res.status(429).json({ 
      success: false, 
      message: 'Ya hay un envío en progreso. Espera a que termine.' 
    });
  }
  
  try {
    isCurrentlySending = true;
    console.log('🔒 BLOQUEANDO envíos simultáneos');
    
    // Usar el VideoSchedulerService para envío manual desde web
    const groupId = process.env.TARGET_GROUP_NAME || 'Club Dev Maval';
    
    // Ejecutar envío usando el scheduler (sin verificación de tiempo para envío manual)
    await videoScheduler.executeVideoSend();
    
    // Actualizar timestamp para evitar envíos duplicados automáticos
    await videoScheduler.setLastSendTime(groupId);
    
    const result = {
      success: true,
      message: 'Video enviado correctamente desde la interfaz web',
      sentAt: new Date().toISOString()
    };
    
    console.log('✅ RESULTADO del envío:', result);
    res.json(result);
  } catch (error) {
    console.error('❌ ERROR CRÍTICO en endpoint /send-youtube-short:', error.message);
    console.error('Stack trace completo:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor',
      error: error.message 
    });
  } finally {
    isCurrentlySending = false;
    console.log('🔓 DESBLOQUEANDO envíos simultáneos');
  }
});

// Endpoint para cerrar sesión
app.post('/logout', async (req, res) => {
  console.log('🔓 Solicitud de logout recibida');
  try {
    if (sock) {
      await sock.logout();
      console.log('✅ Logout ejecutado correctamente');
    }
    
    // Resetear variables
    isReady = false;
    connectionStatus = 'disconnected';
    connectedUser = null;
    qrString = '';
    
    // Usar función centralizada para limpiar archivos
    cleanAuthFiles();
    
    // Reinicializar para generar nuevo QR
    setTimeout(async () => {
      console.log('🔄 Regenerando conexión WhatsApp tras logout manual...');
      try {
        await initializeWhatsApp();
      } catch (error) {
        console.error('Error al regenerar conexión tras logout:', error.message);
      }
    }, 1000);
    
    res.json({ success: true, message: 'Sesión cerrada correctamente' });
  } catch (error) {
    console.error('❌ Error en logout:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al cerrar sesión',
      error: error.message 
    });
  }
});

// JobSchedulerService se inicia automáticamente al importarlo
console.log('💼 JobSchedulerService iniciado - Ofertas cada 12 HORAS EXACTAS');
console.log('📊 Estado del scheduler: GET /job-scheduler-status');
console.log('🔍 Probar búsqueda: POST /search-jobs');
console.log('🚀 Enviar oferta manual: POST /send-job-offer');

// Endpoint para probar SSE manualmente
app.get('/test-sse', (req, res) => {
  broadcastSSE('test', { message: 'Test SSE funcionando' });
  res.json({ success: true, message: 'Evento SSE de prueba enviado' });
});

// Endpoint para obtener estado del VideoSchedulerService
app.get('/scheduler-status', async (req, res) => {
  try {
    const status = await videoScheduler.getStatus();
    res.json({
      success: true,
      scheduler: status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========== ENDPOINTS PARA OFERTAS LABORALES ==========

// Endpoint para obtener estado del JobSchedulerService
app.get('/job-scheduler-status', async (req, res) => {
  try {
    const status = await jobScheduler.getStatus();
    res.json({
      success: true,
      scheduler: status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Endpoint para enviar oferta laboral manualmente
app.post('/send-job-offer', async (req, res) => {
  console.log('💼 INICIO - Solicitud de envío de oferta laboral desde interfaz web');
  
  try {
    const groupId = process.env.TARGET_GROUP_NAME || 'Club Dev Maval';
    
    await jobScheduler.executeJobSend();
    await jobScheduler.setLastSendTime(groupId);
    
    const result = {
      success: true,
      message: 'Oferta laboral enviada correctamente desde la interfaz web',
      sentAt: new Date().toISOString()
    };
    
    console.log('✅ RESULTADO del envío:', result);
    res.json(result);
  } catch (error) {
    console.error('❌ ERROR CRÍTICO en endpoint /send-job-offer:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor',
      error: error.message 
    });
  }
});

// Endpoint para buscar ofertas sin enviar (testing)
app.post('/search-jobs', async (req, res) => {
  try {
    const { category, location, isRemoteOnly } = req.body;
    
    const jobs = await searchJobOffers(
      category || 'FRONTEND',
      location || 'remote',
      isRemoteOnly !== undefined ? isRemoteOnly : false
    );
    
    const stats = getJobStatistics(jobs);
    
    res.json({
      success: true,
      totalJobs: jobs.length,
      jobs: jobs.slice(0, 10),
      statistics: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Endpoint para obtener historial de ofertas enviadas
app.get('/sent-jobs-history', async (req, res) => {
  try {
    const sentJobs = await jobScheduler.getSentJobs();
    res.json({
      success: true,
      ...sentJobs
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Endpoint para probar video-sent manualmente
app.get('/test-video', (req, res) => {
  broadcastSSE('video-sent', {
    title: 'Video de Prueba',
    channelTitle: 'Canal de Prueba',
    topic: 'test',
    description: '🎬 *Video de Prueba*\n\nEste es un video de prueba para verificar la funcionalidad.',
    publishedAt: new Date().toISOString(),
    sentAt: new Date().toISOString()
  });
  res.json({ success: true, message: 'Evento video-sent de prueba enviado' });
});

// Endpoint para refrescar QR manualmente
app.get('/refresh-qr', async (req, res) => {
  try {
    console.log('🔄 Solicitud de refresh QR recibida');
    
    if (sock) {
      // Forzar regeneración de QR cerrando y reiniciando
      await sock.logout();
      console.log('✅ Logout forzado para regenerar QR');
      
      // Limpiar archivos auth
      cleanAuthFiles();
      
      // Reinicializar después de un momento
      setTimeout(async () => {
        console.log('🔄 Regenerando conexión WhatsApp tras refresh QR...');
        try {
          await initializeWhatsApp();
        } catch (error) {
          console.error('Error al regenerar conexión tras refresh:', error.message);
        }
      }, 2000);
      
      res.json({ success: true, message: 'QR refresh iniciado' });
    } else {
      // Si no hay socket, solo reinicializar
      console.log('🔄 Reinicializando WhatsApp...');
      initializeWhatsApp();
      res.json({ success: true, message: 'Inicializando WhatsApp' });
    }
  } catch (error) {
    console.error('❌ Error en refresh QR:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al refrescar QR',
      error: error.message 
    });
  }
});

// Endpoint para Server-Sent Events
app.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Agregar cliente a la lista
  sseClients.push(res);

  // Enviar estado inicial
  res.write(`event: connection\n`);
  res.write(`data: ${JSON.stringify({ 
    status: connectionStatus, 
    qr: qrString,
    user: connectedUser 
  })}\n\n`);

  // Limpiar cliente cuando se desconecta
  req.on('close', () => {
    sseClients = sseClients.filter(client => client !== res);
  });
});

// Limpiar archivos de autenticación al inicio para forzar nuevo QR
cleanAuthFiles();

// Inicializar WhatsApp y servidor
initializeWhatsApp();

app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
  console.log('Abre el navegador para escanear el código QR');
});
