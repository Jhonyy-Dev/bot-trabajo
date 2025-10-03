// Script de prueba para verificar que las APIs de empleo funcionan correctamente
require('dotenv').config();
const { searchJobOffers, getJobStatistics } = require('./job-search-api');

async function testJobSearch() {
  console.log('\n🧪 ===== PRUEBA DE BÚSQUEDA DE OFERTAS LABORALES =====\n');
  
  // TODAS las categorías que el bot maneja
  const categories = ['FRONTEND', 'BACKEND', 'MOBILE', 'DATABASE', 'DATA_ANALYST', 'CYBERSECURITY'];
  
  for (const category of categories) {
    console.log(`\n📋 Probando categoría: ${category}`);
    console.log('─'.repeat(60));
    
    try {
      const jobs = await searchJobOffers(category, 'remote', false);
      
      if (jobs && jobs.length > 0) {
        console.log(`✅ Encontradas ${jobs.length} ofertas`);
        
        // Mostrar las primeras 3
        jobs.slice(0, 3).forEach((job, index) => {
          console.log(`\n${index + 1}. ${job.title}`);
          console.log(`   Empresa: ${job.company}`);
          console.log(`   Ubicación: ${job.location}`);
          console.log(`   Fuente: ${job.source}`);
          console.log(`   Link: ${job.link.substring(0, 60)}...`);
        });
        
        // Estadísticas
        const stats = getJobStatistics(jobs);
        console.log(`\n📊 Estadísticas:`);
        console.log(`   Total: ${stats.total}`);
        console.log(`   Remotas: ${stats.remote}`);
        console.log(`   Con salario: ${stats.withSalary}`);
        console.log(`   Fuentes:`, Object.keys(stats.bySource).join(', '));
        
      } else {
        console.log('⚠️ No se encontraron ofertas para esta categoría');
      }
      
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
    }
    
    console.log('\n');
  }
  
  console.log('🎉 Prueba completada!\n');
  console.log('📝 Notas:');
  console.log('   - RemoteOK y Arbeitnow funcionan sin API key');
  console.log('   - Para más ofertas, configura RAPIDAPI_KEY en .env');
  console.log('   - Revisa API_SETUP.md para más información\n');
}

// Ejecutar prueba
testJobSearch().catch(console.error);
