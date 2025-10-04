const fs = require('fs').promises;
const path = require('path');

class JobSchedulerService {
  constructor() {
    if (JobSchedulerService.instance) {
      console.log('🔄 JobSchedulerService iniciado - Ofertas cada 12 HORAS EXACTAS');
      return JobSchedulerService.instance;
    }
    
    this.INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 HORAS EXACTAS
    this.CHECK_INTERVAL = 15 * 60 * 1000; // Verificar cada 15 minutos
    this.CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // Limpiar cada 24 horas
    
    // Usar /data si existe (Railway Volume), sino usar directorio actual
    const dataDir = require('fs').existsSync('/data') ? '/data' : process.cwd();
    this.configFile = path.join(dataDir, 'job_schedule.json');
    this.sentJobsFile = path.join(dataDir, 'jobs_sent.json');
    this.retryAttempts = 3;
    this.circuitBreaker = { failures: 0, isOpen: false, nextAttempt: 0 };
    this.lastCleanup = 0;
    
    // Categorías de empleo en rotación circular
    this.jobCategories = ['FRONTEND', 'BACKEND', 'MOBILE', 'DATABASE', 'DATA_ANALYST', 'CYBERSECURITY'];
    this.currentCategoryIndex = 0;
    
    JobSchedulerService.instance = this;
    this.startScheduler();
    this.startCleanupScheduler();
  }

  log(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`, Object.keys(data).length > 0 ? data : '');
  }

  async getScheduleData() {
    try {
      // Primero intentar leer desde archivo
      const data = await fs.readFile(this.configFile, 'utf8');
      const schedule = JSON.parse(data);
      await this.cleanupOldEntries(schedule);
      return schedule;
    } catch (error) {
      // Si falla, usar memoria en proceso (fallback para Railway sin Volume)
      if (!global.jobScheduleMemory) {
        global.jobScheduleMemory = {};
      }
      return global.jobScheduleMemory;
    }
  }

  async saveScheduleData(scheduleData) {
    try {
      const dataToSave = {
        ...scheduleData,
        _metadata: {
          lastCleanup: this.lastCleanup,
          createdAt: Date.now(),
          version: '2.0-jobs'
        }
      };
      
      // Intentar guardar en archivo primero
      try {
        await fs.writeFile(this.configFile, JSON.stringify(dataToSave, null, 2));
        this.log('debug', 'Schedule data saved to file');
      } catch (fileError) {
        // Fallback: Guardar en memoria global (para Railway sin Volume)
        global.jobScheduleMemory = dataToSave;
        this.log('warn', 'File save failed, using memory fallback', { error: fileError.message });
      }
    } catch (error) {
      this.log('error', 'Error saving schedule data', { error: error.message });
      throw error;
    }
  }

  async getSentJobs() {
    try {
      const data = await fs.readFile(this.sentJobsFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      // Fallback: usar memoria global
      if (!global.sentJobsMemory) {
        global.sentJobsMemory = { jobs: [], _metadata: { totalSent: 0 } };
      }
      return global.sentJobsMemory;
    }
  }

  async addSentJob(jobData) {
    try {
      const sentJobs = await this.getSentJobs();
      
      sentJobs.jobs.push({
        link: jobData.link,
        title: jobData.title,
        company: jobData.company,
        category: jobData.category,
        sentAt: new Date().toISOString(),
        source: jobData.source
      });

      if (sentJobs.jobs.length > 100) {
        sentJobs.jobs = sentJobs.jobs.slice(-100);
      }

      sentJobs._metadata = {
        totalSent: (sentJobs._metadata?.totalSent || 0) + 1,
        lastSentAt: new Date().toISOString()
      };

      try {
        await fs.writeFile(this.sentJobsFile, JSON.stringify(sentJobs, null, 2));
      } catch (fileError) {
        // Fallback: guardar en memoria
        global.sentJobsMemory = sentJobs;
        this.log('warn', 'Jobs file save failed, using memory', { error: fileError.message });
      }
      this.log('info', 'Job registered in sent history', { 
        title: jobData.title,
        company: jobData.company 
      });
    } catch (error) {
      this.log('error', 'Error saving sent job', { error: error.message });
    }
  }

  async isJobAlreadySent(jobLink) {
    try {
      const sentJobs = await this.getSentJobs();
      return sentJobs.jobs.some(job => job.link === jobLink);
    } catch (error) {
      return false;
    }
  }

  async cleanupOldEntries(schedule = null) {
    try {
      if (!schedule) {
        schedule = await this.getScheduleData();
      }

      const now = Date.now();
      const lastCleanupTime = schedule._metadata?.lastCleanup || 0;
      const timeSinceLastCleanup = now - lastCleanupTime;

      if (timeSinceLastCleanup >= this.CLEANUP_INTERVAL) {
        const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
        const cleanedSchedule = { _metadata: schedule._metadata };
        let entriesRemoved = 0;

        for (const [groupId, data] of Object.entries(schedule)) {
          if (groupId === '_metadata') continue;

          if (data.timestamp && data.timestamp > sevenDaysAgo) {
            cleanedSchedule[groupId] = data;
          } else {
            entriesRemoved++;
          }
        }

        this.lastCleanup = now;
        cleanedSchedule._metadata = {
          ...cleanedSchedule._metadata,
          lastCleanup: this.lastCleanup,
          lastCleanupDate: new Date(this.lastCleanup).toISOString(),
          totalEntriesRemoved: (cleanedSchedule._metadata?.totalEntriesRemoved || 0) + entriesRemoved
        };

        await fs.writeFile(this.configFile, JSON.stringify(cleanedSchedule, null, 2));
        this.log('info', 'Cleanup completed', { entriesRemoved });

        return cleanedSchedule;
      }

      return schedule;
    } catch (error) {
      this.log('error', 'Error during cleanup', { error: error.message });
      return schedule || {};
    }
  }

  startCleanupScheduler() {
    setTimeout(async () => {
      await this.cleanupOldEntries();
    }, 60 * 1000);

    setInterval(async () => {
      try {
        await this.cleanupOldEntries();
      } catch (error) {
        this.log('error', 'Scheduled cleanup failed', { error: error.message });
      }
    }, this.CLEANUP_INTERVAL);

    this.log('info', 'Cleanup scheduler started');
  }

  async getLastSendTime(groupId) {
    try {
      const schedule = await this.getScheduleData();
      return schedule[groupId] || null;
    } catch (error) {
      this.log('error', 'Error getting last send time', { groupId, error: error.message });
      return null;
    }
  }

  async setLastSendTime(groupId, timestamp = Date.now()) {
    try {
      const schedule = await this.getScheduleData();
      
      schedule[groupId] = {
        timestamp,
        utcDate: new Date(timestamp).toISOString(),
        nextAllowed: timestamp + this.INTERVAL_MS,
        nextAllowedDate: new Date(timestamp + this.INTERVAL_MS).toISOString(),
        createdAt: timestamp,
        lastCategory: this.jobCategories[this.currentCategoryIndex]
      };

      await this.saveScheduleData(schedule);
      this.log('info', 'Last send time updated', { 
        groupId, 
        nextSendTime: schedule[groupId].nextAllowedDate,
        category: schedule[groupId].lastCategory
      });
    } catch (error) {
      this.log('error', 'Error setting last send time', { groupId, error: error.message });
      throw error;
    }
  }

  async canSendJob(groupId) {
    const lastSend = await this.getLastSendTime(groupId);
    const now = Date.now();

    if (!lastSend) {
      return { 
        canSend: true, 
        reason: 'FIRST_TIME',
        message: 'Primera vez enviando oferta a este grupo'
      };
    }

    const timeSinceLastSend = now - lastSend.timestamp;
    const canSend = timeSinceLastSend >= this.INTERVAL_MS;

    if (canSend) {
      const hoursWaited = Math.round(timeSinceLastSend / (1000 * 60 * 60) * 10) / 10;
      return { 
        canSend: true, 
        reason: 'TIME_ELAPSED',
        hoursWaited,
        message: `✅ HAN PASADO ${hoursWaited} HORAS - ENVIANDO OFERTA`
      };
    } else {
      const remainingMs = this.INTERVAL_MS - timeSinceLastSend;
      const remainingHours = Math.round(remainingMs / (1000 * 60 * 60) * 10) / 10;
      
      return { 
        canSend: false, 
        reason: 'TIME_NOT_ELAPSED', 
        remainingHours,
        nextAllowedTime: lastSend.nextAllowedDate,
        message: `⏳ FALTAN ${remainingHours} HORAS PARA EL PRÓXIMO ENVÍO`
      };
    }
  }

  async sendJobWithRetry(groupId, sendFunction) {
    const canSendResult = await this.canSendJob(groupId);
    if (!canSendResult.canSend) {
      return false;
    }

    if (this.circuitBreaker.isOpen && Date.now() < this.circuitBreaker.nextAttempt) {
      return false;
    }

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        this.log('info', '🚀 INICIANDO ENVÍO DE OFERTA', { 
          groupId, 
          attempt
        });
        
        await sendFunction();
        
        await this.setLastSendTime(groupId);
        this.circuitBreaker = { failures: 0, isOpen: false, nextAttempt: 0 };
        
        this.log('info', '✅ OFERTA ENVIADA EXITOSAMENTE', { 
          groupId,
          nextSendTime: new Date(Date.now() + this.INTERVAL_MS).toISOString()
        });
        
        return true;
      } catch (error) {
        this.log('error', 'Failed to send job offer', { 
          groupId, 
          attempt,
          error: error.message
        });

        if (attempt === this.retryAttempts) {
          this.circuitBreaker.failures++;
          if (this.circuitBreaker.failures >= 3) {
            this.circuitBreaker.isOpen = true;
            this.circuitBreaker.nextAttempt = Date.now() + (30 * 60 * 1000);
          }
        } else {
          const waitTime = 1000 * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    return false;
  }

  startScheduler() {
    setInterval(() => {
      this.checkAndSendJob();
    }, this.CHECK_INTERVAL);

    this.log('info', '🔄 JOB SCHEDULER INICIADO - ENVÍO CADA 12 HORAS EXACTAS', {
      categories: this.jobCategories
    });
  }

  async checkAndSendJob() {
    try {
      if (!global.waSocket) {
        return;
      }

      const groupId = process.env.TARGET_GROUP_NAME || 'Club Dev Maval';
      
      await this.sendJobWithRetry(groupId, async () => {
        await this.executeJobSend();
      });

    } catch (error) {
      this.log('error', 'Scheduler check failed', { error: error.message });
    }
  }

  async executeJobSend() {
    this.log('info', '💼 EJECUTANDO ENVÍO DE OFERTA LABORAL...');
    
    const { searchJobOffers } = require('./job-search-api');
    const { enhanceJobDescription } = require('./gemini-ai');
    
    try {
      if (!global.waSocket) {
        throw new Error('No hay conexión activa a WhatsApp');
      }
      
      const waSocket = global.waSocket;
      
      const targetGroupName = process.env.TARGET_GROUP_NAME || 'Club Dev Maval';
      console.log(`🔍 Buscando grupo: ${targetGroupName}`);
      
      const chats = await waSocket.groupFetchAllParticipating();
      const groups = Object.values(chats);
      
      const targetGroup = groups.find(group => 
        group.subject && group.subject.toLowerCase().includes(targetGroupName.toLowerCase())
      );

      if (!targetGroup) {
        throw new Error(`Grupo objetivo '${targetGroupName}' no encontrado`);
      }
      
      console.log(`✅ Grupo encontrado: ${targetGroup.subject}`);
      
      // Rotación circular de categorías
      const currentCategory = this.jobCategories[this.currentCategoryIndex];
      console.log(`🎯 Categoría actual [${this.currentCategoryIndex + 1}/${this.jobCategories.length}]: ${currentCategory}`);
      
      // Avanzar al siguiente índice
      this.currentCategoryIndex = (this.currentCategoryIndex + 1) % this.jobCategories.length;
      
      // Configuración de búsqueda desde .env
      const searchRemote = process.env.SEARCH_REMOTE_ONLY === 'true';
      const locations = process.env.JOB_LOCATIONS?.split(',') || ['remote'];
      const primaryLocation = locations[0];
      
      // Buscar ofertas
      const jobs = await searchJobOffers(currentCategory, primaryLocation, searchRemote);
      
      if (!jobs || jobs.length === 0) {
        throw new Error('No se encontraron ofertas laborales para esta categoría');
      }
      
      // Filtrar ofertas ya enviadas
      let selectedJob = null;
      for (const job of jobs) {
        const alreadySent = await this.isJobAlreadySent(job.link);
        if (!alreadySent) {
          selectedJob = job;
          break;
        }
      }
      
      if (!selectedJob) {
        throw new Error('Todas las ofertas encontradas ya fueron enviadas');
      }
      
      this.log('info', `💼 Oferta seleccionada: ${selectedJob.title} en ${selectedJob.company}`);
      
      // Generar descripción mejorada con Gemini
      const enhancedMessage = await enhanceJobDescription(
        selectedJob.title,
        selectedJob.company,
        selectedJob.description,
        currentCategory,
        selectedJob.salary,
        selectedJob.location,
        selectedJob.link,
        selectedJob.source,
        selectedJob.postedDate
      );
      
      // Enviar mensaje al grupo
      await waSocket.sendMessage(targetGroup.id, { 
        text: enhancedMessage
      });
      
      // Registrar como enviada
      await this.addSentJob({
        ...selectedJob,
        category: currentCategory
      });
      
      this.log('info', '✅ Oferta laboral enviada correctamente');
      
    } catch (error) {
      this.log('error', 'Error en executeJobSend', { error: error.message });
      throw error;
    }
  }

  async getStatus() {
    try {
      const groupId = process.env.TARGET_GROUP_NAME || 'Club Dev Maval';
      const canSendResult = await this.canSendJob(groupId);
      const lastSend = await this.getLastSendTime(groupId);
      const sentJobs = await this.getSentJobs();
      
      return {
        status: 'active',
        type: 'job-offers',
        strictMode: 'EXACTLY_12_HOURS',
        groupId,
        canSend: canSendResult.canSend,
        message: canSendResult.message,
        lastSendTime: lastSend?.utcDate || 'Never',
        nextAllowedTime: lastSend?.nextAllowedDate || 'Now',
        remainingHours: canSendResult.remainingHours || 0,
        intervalHours: 12,
        currentCategory: this.jobCategories[this.currentCategoryIndex],
        allCategories: this.jobCategories,
        totalJobsSent: sentJobs._metadata?.totalSent || 0,
        circuitBreaker: {
          isOpen: this.circuitBreaker.isOpen,
          failures: this.circuitBreaker.failures
        }
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message
      };
    }
  }
}

const jobScheduler = new JobSchedulerService();

async function getSchedulerStatus() {
  const status = await jobScheduler.getStatus();
  console.log('=== JOB SCHEDULER STATUS - 12 HOUR INTERVALS ===');
  console.log(JSON.stringify(status, null, 2));
  return status;
}

module.exports = { JobSchedulerService, jobScheduler, getSchedulerStatus };
