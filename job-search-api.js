// Módulo para buscar ofertas laborales desde múltiples fuentes (Sistema Híbrido)
const axios = require('axios');
require('dotenv').config();

// Categorías laborales soportadas (INGLÉS + ESPAÑOL)
const JOB_CATEGORIES = {
  FRONTEND: [
    'frontend developer', 'desarrollador frontend', 'react developer', 'desarrollador react', 
    'vue developer', 'desarrollador vue', 'angular developer', 'desarrollador angular', 
    'web developer', 'desarrollador web', 'fullstack developer', 'desarrollador fullstack', 'fullstack', 'frontend developer', 'desarrollador frontend'
  ],
  BACKEND: [
    'backend developer', 'desarrollador backend', 'node.js developer', 'desarrollador node.js',
    'python developer', 'desarrollador python', 'java developer', 'desarrollador java', 
    'api developer', 'desarrollador api', 'desarrollador de software', 'software developer', 'fullstack developer', 'desarrollador fullstack', 'fullstack', 'backend developer', 'desarrollador backend'
  ],
  MOBILE: [
    'mobile developer', 'desarrollador móvil', 'desarrollador mobile', 'ios developer', 
    'desarrollador ios', 'android developer', 'desarrollador android', 
    'react native developer', 'desarrollador react native', 'flutter developer', 'desarrollador flutter', 'fullstack developer', 'desarrollador fullstack', 'fullstack', 'mobile developer', 'desarrollador móvil', 'desarrollador mobile'
  ],
  DESIGNER: [
    'graphic designer', 'diseñador gráfico', 'ui/ux designer', 'diseñador ui/ux', 
    'ui designer', 'diseñador ui', 'ux designer', 'diseñador ux',
    'product designer', 'diseñador de producto', 'visual designer', 'diseñador visual',
    'web designer', 'diseñador web', 'designer', 'diseñador'
  ],
  DATABASE: [
    'database administrator', 'administrador de base de datos', 'dba', 
    'database developer', 'desarrollador de base de datos', 'sql developer', 'desarrollador sql', 'fullstack developer', 'desarrollador fullstack', 'fullstack', 'database administrator', 'administrador de base de datos', 'dba'
  ],
  DATA_ANALYST: [
    'data analyst', 'analista de datos', 'business analyst', 'analista de negocios',
    'data scientist junior', 'científico de datos junior', 'ciencia de datos', 'data science', 'fullstack developer', 'desarrollador fullstack', 'fullstack', 'data analyst', 'analista de datos', 'business analyst', 'analista de negocios', 'data scientist junior', 'científico de datos junior', 'ciencia de datos', 'data science'
  ],
  CYBERSECURITY: [
    'cybersecurity analyst', 'analista de ciberseguridad', 'security analyst', 'analista de seguridad',
    'infosec analyst', 'junior security engineer', 'ingeniero de seguridad junior', 'fullstack developer', 'desarrollador fullstack', 'fullstack', 'cybersecurity analyst', 'analista de ciberseguridad', 'security analyst', 'analista de seguridad', 'infosec analyst', 'junior security engineer', 'ingeniero de seguridad junior'
  ]
};

// Niveles de experiencia para filtrar (INGLÉS + ESPAÑOL)
const JUNIOR_KEYWORDS = [
  'junior', 'trainee', 'entry level', 'entry-level', 'graduate', 'jr', 'jr.', 'beginner', 
  'sin experiencia', '0-2 years', '0-1 year', 'recién graduado', 'practicante', 
  'pasante', 'intern', 'internship', 'aprendiz', 'nivel inicial', 'principiante',
  'graduado', 'fresh graduate', 'recien egresado'
];

// Países latinoamericanos permitidos
const ALLOWED_COUNTRIES = [
  'mexico', 'méxico', 'nicaragua', 'guatemala', 'el salvador', 'colombia', 'brasil', 'brazil',
  'ecuador', 'peru', 'perú', 'chile', 'argentina', 'uruguay', 'paraguay',
  'remote', 'remoto', 'worldwide', 'latam', 'latin america', 'latinoamérica', 'latinoamerica'
];

// Días máximos de antigüedad permitidos (configurable desde .env)
const MAX_DAYS_OLD = parseInt(process.env.MAX_DAYS_OLD) || 30;

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
        num_pages: 2, // Obtener 2 páginas = ~20 resultados por búsqueda
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
      .map(job => {
        // Arbeitnow usa timestamps Unix en SEGUNDOS, convertir a ISO string
        let isoDate = new Date().toISOString();
        try {
          if (job.created_at) {
            // Si es un número (timestamp Unix), multiplicar por 1000 para convertir a ms
            const timestamp = typeof job.created_at === 'number' ? job.created_at * 1000 : job.created_at;
            isoDate = new Date(timestamp).toISOString();
          }
        } catch (e) {
          console.warn('Error parseando fecha de Arbeitnow:', e.message);
        }
        
        return {
          title: job.title,
          company: job.company_name,
          location: job.location || 'Europa',
          salary: 'No especificado',
          link: job.url,
          description: job.description || '',
          postedDate: isoDate,
          source: 'Arbeitnow (Europa)',
          isRemote: job.remote || false,
          employmentType: job.job_types?.[0] || 'FULLTIME',
          tags: job.tags || []
        };
      });

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

  // TODOS los países LATAM para buscar
  const topLatamCountries = [
    'Mexico', 'Nicaragua', 'Guatemala', 'El Salvador', 
    'Colombia', 'Brasil', 'Ecuador', 'Peru', 
    'Chile', 'Argentina', 'Uruguay', 'Paraguay'
  ];
  
  // Buscar en múltiples ubicaciones para aumentar resultados
  const searchPromises = [];
  
  if (location.toLowerCase() === 'remote') {
    // Si busca "remote", buscar específicamente "remote Latin America"
    searchPromises.push(searchJSearchAPI(category, 'remote Latin America'));
    
    // También buscar en países LATAM principales
    topLatamCountries.forEach(country => {
      searchPromises.push(searchJSearchAPI(category, country));
    });
  } else {
    // Si especifica un país, buscar solo ahí
    searchPromises.push(searchJSearchAPI(category, location));
  }

  try {
    const results = await Promise.allSettled(searchPromises);
    
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        allJobs.push(...result.value);
      } else {
        console.log(`⚠️ Búsqueda ${index + 1} falló: ${result.reason?.message || 'Error desconocido'}`);
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

  // Filtrar por Junior/Trainee
  const juniorJobs = filterJobsByLevel(uniqueJobs, JUNIOR_KEYWORDS);
  console.log(`👶 Ofertas nivel junior/trainee: ${juniorJobs.length}`);

  // Filtrar por países latinoamericanos
  const latinJobs = filterJobsByLocation(juniorJobs, ALLOWED_COUNTRIES);
  console.log(`🌎 Ofertas en países permitidos: ${latinJobs.length}`);
  
  // Debug: mostrar ubicaciones que fueron filtradas
  if (juniorJobs.length > latinJobs.length) {
    const rejected = juniorJobs.filter(j => !latinJobs.includes(j));
    console.log(`⚠️ ${rejected.length} ofertas rechazadas por ubicación:`);
    rejected.slice(0, 3).forEach(job => {
      console.log(`   - "${job.title}" en "${job.location}"`);
    });
  }

  // Filtrar por antigüedad (máximo 7 días)
  const recentJobs = filterJobsByDate(latinJobs, MAX_DAYS_OLD);
  console.log(`📅 Ofertas recientes (últimos ${MAX_DAYS_OLD} días): ${recentJobs.length}`);

  recentJobs.sort((a, b) => new Date(b.postedDate) - new Date(a.postedDate));

  return recentJobs;
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
 * Filtra ofertas por ubicación (países latinoamericanos)
 */
function filterJobsByLocation(jobs, allowedCountries) {
  return jobs.filter(job => {
    const location = (job.location || '').toLowerCase();
    
    // Términos que indican LATAM o worldwide
    const latinTerms = [
      'latam', 'latin america', 'latinoamérica', 'latinoamerica',
      'south america', 'sudamerica', 'sudamérica', 'central america',
      'centroamerica', 'centroamérica', 'hispanic', 'spanish speaking'
    ];
    
    // Si menciona LATAM explícitamente, aceptar
    if (latinTerms.some(term => location.includes(term))) {
      return true;
    }
    
    // Si la oferta es remota
    if (job.isRemote === true || location.includes('remote') || location.includes('remoto')) {
      // Aceptar worldwide/global/anywhere (sin restricción de país)
      if (!location || 
          location.includes('worldwide') || 
          location.includes('anywhere') ||
          location.includes('global')) {
        return true;
      }
      
      // Si especifica país, debe ser LATAM
      return allowedCountries.some(country => location.includes(country));
    }
    
    // Para ofertas presenciales, verificar si la ubicación contiene algún país permitido
    return allowedCountries.some(country => location.includes(country));
  });
}

/**
 * Filtra ofertas por antigüedad (máximo N días)
 */
function filterJobsByDate(jobs, maxDays) {
  return jobs.filter(job => {
    try {
      if (!job.postedDate) return false;
      
      const postedTime = new Date(job.postedDate).getTime();
      const now = Date.now();
      const diffMs = now - postedTime;
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      
      // Rechazar fechas inválidas o futuras
      if (isNaN(diffDays) || diffDays < 0 || diffDays > maxDays) {
        return false;
      }
      
      return true;
    } catch (e) {
      console.warn('Error validando fecha:', e.message);
      return false;
    }
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
  filterJobsByLocation,
  filterJobsByDate,
  removeDuplicateJobs,
  getJobStatistics,
  JOB_CATEGORIES,
  JUNIOR_KEYWORDS,
  ALLOWED_COUNTRIES,
  MAX_DAYS_OLD
};
