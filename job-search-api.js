// Módulo para buscar ofertas laborales desde múltiples fuentes (Sistema Híbrido)
const axios = require('axios');
require('dotenv').config();

// Categorías laborales soportadas
const JOB_CATEGORIES = {
  FRONTEND: ['frontend developer', 'react developer', 'vue developer', 'angular developer', 'web developer'],
  BACKEND: ['backend developer', 'node.js developer', 'python developer', 'java developer', 'api developer'],
  MOBILE: ['mobile developer', 'ios developer', 'android developer', 'react native developer', 'flutter developer'],
  DATABASE: ['database administrator', 'dba', 'database developer', 'sql developer'],
  DATA_ANALYST: ['data analyst', 'business analyst', 'data scientist junior'],
  CYBERSECURITY: ['cybersecurity analyst', 'security analyst', 'infosec analyst', 'junior security engineer']
};

// Niveles de experiencia para filtrar
const JUNIOR_KEYWORDS = ['junior', 'trainee', 'entry level', 'entry-level', 'graduate', 'jr', 'beginner', 'sin experiencia', '0-2 years', 'recién graduado'];

/**
 * 1. JSearch API (RapidAPI) - LinkedIn, Indeed, Glassdoor
 */
async function searchJSearchAPI(query, location = 'remote', page = 1) {
  try {
    const apiKey = process.env.RAPIDAPI_KEY;
    if (!apiKey) {
      console.log('⚠️ RAPIDAPI_KEY no configurada, saltando JSearch API');
      return [];
    }

    console.log(`🔍 Buscando en JSearch API: ${query} - ${location}`);
    
    const response = await axios.get('https://jsearch.p.rapidapi.com/search', {
      params: {
        query: `${query} ${location}`,
        page: page,
        num_pages: 1,
        date_posted: 'month'
      },
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': 'jsearch.p.rapidapi.com'
      },
      timeout: 10000
    });

    if (!response.data || !response.data.data) {
      console.log('❌ JSearch API: Sin resultados');
      return [];
    }

    const jobs = response.data.data.map(job => ({
      title: job.job_title,
      company: job.employer_name,
      location: job.job_location || location,
      salary: job.job_salary || 'No especificado',
      link: job.job_apply_link,
      description: job.job_description || '',
      postedDate: job.job_posted_at_datetime_utc,
      source: 'JSearch (LinkedIn/Indeed)',
      isRemote: job.job_is_remote || false,
      employmentType: job.job_employment_type,
      requiredExperience: job.job_required_experience?.required_experience_in_months || null
    }));

    console.log(`✅ JSearch API: ${jobs.length} ofertas encontradas`);
    return jobs;

  } catch (error) {
    console.log(`⚠️ Error en JSearch API: ${error.message}`);
    return [];
  }
}

/**
 * 2. RemoteOK API - Trabajos 100% remotos tech
 */
async function searchRemoteOKAPI(category) {
  try {
    console.log(`🔍 Buscando en RemoteOK API: ${category}`);
    
    const response = await axios.get('https://remoteok.com/api', {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; JobBot/1.0)'
      }
    });

    if (!response.data || !Array.isArray(response.data)) {
      console.log('❌ RemoteOK API: Sin resultados');
      return [];
    }

    const allJobs = response.data.slice(1);

    const categoryKeywords = JOB_CATEGORIES[category.toUpperCase()] || [category];
    const jobs = allJobs
      .filter(job => {
        const fullText = `${job.position} ${job.description || ''} ${job.tags?.join(' ') || ''}`.toLowerCase();
        return categoryKeywords.some(keyword => fullText.includes(keyword.toLowerCase()));
      })
      .slice(0, 10)
      .map(job => ({
        title: job.position,
        company: job.company,
        location: '100% Remote 🌎',
        salary: job.salary_range || 'No especificado',
        link: `https://remoteok.com/remote-jobs/${job.id}`,
        description: job.description || '',
        postedDate: job.date ? new Date(job.date).toISOString() : new Date().toISOString(),
        source: 'RemoteOK',
        isRemote: true,
        employmentType: 'FULLTIME',
        tags: job.tags || []
      }));

    console.log(`✅ RemoteOK API: ${jobs.length} ofertas encontradas`);
    return jobs;

  } catch (error) {
    console.log(`⚠️ Error en RemoteOK API: ${error.message}`);
    return [];
  }
}

/**
 * 3. Arbeitnow API - Europa (gratis, sin API key)
 */
async function searchArbeitnowAPI(category) {
  try {
    console.log(`🔍 Buscando en Arbeitnow API: ${category}`);
    
    const response = await axios.get('https://www.arbeitnow.com/api/job-board-api', {
      timeout: 10000
    });

    if (!response.data || !response.data.data) {
      console.log('❌ Arbeitnow API: Sin resultados');
      return [];
    }

    const categoryKeywords = JOB_CATEGORIES[category.toUpperCase()] || [category];
    const jobs = response.data.data
      .filter(job => {
        const fullText = `${job.title} ${job.description || ''} ${job.tags?.join(' ') || ''}`.toLowerCase();
        return categoryKeywords.some(keyword => fullText.includes(keyword.toLowerCase()));
      })
      .slice(0, 10)
      .map(job => ({
        title: job.title,
        company: job.company_name,
        location: job.location || 'Europa',
        salary: 'No especificado',
        link: job.url,
        description: job.description || '',
        postedDate: job.created_at,
        source: 'Arbeitnow (Europa)',
        isRemote: job.remote || false,
        employmentType: job.job_types?.[0] || 'FULLTIME',
        tags: job.tags || []
      }));

    console.log(`✅ Arbeitnow API: ${jobs.length} ofertas encontradas`);
    return jobs;

  } catch (error) {
    console.log(`⚠️ Error en Arbeitnow API: ${error.message}`);
    return [];
  }
}

/**
 * 4. USAJOBS API - Gobierno USA (opcional)
 */
async function searchUSAJobsAPI(category) {
  try {
    const apiKey = process.env.USAJOBS_API_KEY;
    const userEmail = process.env.USAJOBS_EMAIL;
    
    if (!apiKey || !userEmail) {
      console.log('⚠️ USAJOBS_API_KEY o USAJOBS_EMAIL no configuradas, saltando USAJOBS API');
      return [];
    }

    console.log(`🔍 Buscando en USAJOBS API: ${category}`);
    
    const response = await axios.get('https://data.usajobs.gov/api/search', {
      params: {
        Keyword: category,
        ResultsPerPage: 10,
        Page: 1
      },
      headers: {
        'Host': 'data.usajobs.gov',
        'User-Agent': userEmail,
        'Authorization-Key': apiKey
      },
      timeout: 10000
    });

    if (!response.data || !response.data.SearchResult?.SearchResultItems) {
      console.log('❌ USAJOBS API: Sin resultados');
      return [];
    }

    const jobs = response.data.SearchResult.SearchResultItems.map(item => {
      const job = item.MatchedObjectDescriptor;
      return {
        title: job.PositionTitle,
        company: job.OrganizationName,
        location: job.PositionLocationDisplay,
        salary: job.PositionRemuneration?.[0]?.Description || 'No especificado',
        link: job.PositionURI,
        description: job.UserArea?.Details?.JobSummary || '',
        postedDate: job.PublicationStartDate,
        source: 'USAJOBS (Gobierno USA)',
        isRemote: job.PositionLocationDisplay?.toLowerCase().includes('remote'),
        employmentType: job.PositionSchedule?.[0]?.Name || 'FULLTIME'
      };
    });

    console.log(`✅ USAJOBS API: ${jobs.length} ofertas encontradas`);
    return jobs;

  } catch (error) {
    console.log(`⚠️ Error en USAJOBS API: ${error.message}`);
    return [];
  }
}

/**
 * FUNCIÓN PRINCIPAL: Búsqueda híbrida combinando todas las APIs
 */
async function searchJobOffers(category, location = 'remote', isRemoteOnly = false) {
  console.log(`\n🚀 INICIANDO BÚSQUEDA HÍBRIDA DE OFERTAS`);
  console.log(`📋 Categoría: ${category}`);
  console.log(`📍 Ubicación: ${location}`);
  console.log(`🌎 Solo remoto: ${isRemoteOnly ? 'Sí' : 'No'}\n`);

  const allJobs = [];

  const searchPromises = [
    searchJSearchAPI(category, location),
    searchRemoteOKAPI(category),
    searchArbeitnowAPI(category)
  ];

  if (process.env.USAJOBS_API_KEY) {
    searchPromises.push(searchUSAJobsAPI(category));
  }

  try {
    const results = await Promise.allSettled(searchPromises);
    
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        allJobs.push(...result.value);
      } else {
        console.log(`⚠️ API ${index + 1} falló: ${result.reason?.message || 'Error desconocido'}`);
      }
    });

  } catch (error) {
    console.error('❌ Error en búsqueda híbrida:', error.message);
  }

  console.log(`\n📊 RESULTADOS TOTALES: ${allJobs.length} ofertas de todas las fuentes`);

  let filteredJobs = allJobs;
  if (isRemoteOnly) {
    filteredJobs = allJobs.filter(job => job.isRemote === true);
    console.log(`🌎 Filtrado remoto: ${filteredJobs.length} ofertas remotas`);
  }

  const uniqueJobs = removeDuplicateJobs(filteredJobs);
  console.log(`✅ Ofertas únicas (sin duplicados): ${uniqueJobs.length}`);

  const juniorJobs = filterJobsByLevel(uniqueJobs, JUNIOR_KEYWORDS);
  console.log(`👶 Ofertas nivel junior/trainee: ${juniorJobs.length}`);

  juniorJobs.sort((a, b) => new Date(b.postedDate) - new Date(a.postedDate));

  return juniorJobs;
}

/**
 * Filtra ofertas por nivel de experiencia (junior, trainee, entry-level)
 */
function filterJobsByLevel(jobs, keywords) {
  return jobs.filter(job => {
    const fullText = `${job.title} ${job.description}`.toLowerCase();
    
    const hasJuniorKeyword = keywords.some(keyword => fullText.includes(keyword.toLowerCase()));
    
    const hasLowExperience = job.requiredExperience 
      ? job.requiredExperience <= 24
      : true;

    const hasSeniorKeyword = /senior|lead|principal|staff|expert|architect/i.test(fullText);

    return (hasJuniorKeyword || hasLowExperience) && !hasSeniorKeyword;
  });
}

/**
 * Elimina ofertas duplicadas por link o título+empresa
 */
function removeDuplicateJobs(jobs) {
  const seen = new Set();
  return jobs.filter(job => {
    const key = job.link || `${job.title}-${job.company}`.toLowerCase().replace(/\s+/g, '');
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Obtiene estadísticas de las ofertas encontradas
 */
function getJobStatistics(jobs) {
  const stats = {
    total: jobs.length,
    bySource: {},
    byLocation: {},
    remote: jobs.filter(j => j.isRemote).length,
    withSalary: jobs.filter(j => j.salary && j.salary !== 'No especificado').length
  };

  jobs.forEach(job => {
    stats.bySource[job.source] = (stats.bySource[job.source] || 0) + 1;
    
    const location = job.location || 'Unknown';
    stats.byLocation[location] = (stats.byLocation[location] || 0) + 1;
  });

  return stats;
}

module.exports = {
  searchJobOffers,
  filterJobsByLevel,
  removeDuplicateJobs,
  getJobStatistics,
  JOB_CATEGORIES
};
