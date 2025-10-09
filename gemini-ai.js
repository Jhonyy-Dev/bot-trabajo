// Módulo para integración con Gemini AI - Bot de Ofertas Laborales
require('dotenv').config();

/**
 * Genera una descripción atractiva para ofertas laborales usando Gemini AI
 * @param {string} jobTitle - Título de la oferta
 * @param {string} company - Nombre de la empresa
 * @param {string} description - Descripción original
 * @param {string} category - Categoría del empleo
 * @param {string} salary - Salario ofrecido
 * @param {string} location - Ubicación del trabajo
 * @param {string} link - Link de la oferta
 * @param {string} source - Fuente de la oferta
 * @param {string} postedDate - Fecha de publicación
 * @returns {Promise<string>} - Mensaje formateado para WhatsApp
 */
async function enhanceJobDescription(jobTitle, company, description, category, salary, location, link, source, postedDate) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      console.log('No se encontró la API key de Gemini. Usando descripción predeterminada.');
      return generateSmartJobDescription(jobTitle, company, description, category, salary, location, link, source, postedDate);
    }

    const { GoogleGenAI } = require('@google/genai');
    
    const ai = new GoogleGenAI({
      apiKey: apiKey,
    });

    const config = {};
    const model = 'gemini-2.0-flash-thinking-exp';
    
    // Calcular antigüedad de la oferta
    const daysAgo = postedDate ? Math.floor((Date.now() - new Date(postedDate)) / (1000 * 60 * 60 * 24)) : null;
    const dateInfo = daysAgo !== null ? `Publicada hace ${daysAgo} día${daysAgo !== 1 ? 's' : ''}` : 'Fecha no disponible';
    
    const prompt = `Genera un mensaje atractivo y profesional en español para una oferta de trabajo en WhatsApp.

Título: ${jobTitle}
Empresa: ${company}
Categoría: ${category}
Ubicación: ${location}
Salario: ${salary}
Fecha de publicación: ${dateInfo}
Descripción: ${description.substring(0, 500)}

INSTRUCCIONES:
1. Inicia con un emoji relacionado con la categoría
2. Destaca el título del trabajo y la empresa de forma llamativa
3. Resume en 2-3 oraciones lo más importante de la oferta
4. Menciona los requisitos principales si están disponibles
5. Incluye la ubicación y si es remoto
6. Mantén un tono motivador y profesional
7. El mensaje debe ser BREVE (máximo 300 palabras)
8. NO incluyas el link en tu respuesta, yo lo agregaré al final

El mensaje debe motivar a postularse y ser claro sobre lo que se busca.`;

    const contents = [
      {
        role: 'user',
        parts: [
          {
            text: prompt,
          },
        ],
      },
    ];

    const response = await ai.models.generateContentStream({
      model,
      config,
      contents,
    });

    let generatedText = '';
    for await (const chunk of response) {
      if (chunk.text) {
        generatedText += chunk.text;
      }
    }

    if (generatedText.trim()) {
      console.log('✅ Descripción generada por Gemini AI');
      
      // Calcular días de antigüedad para el mensaje final
      const daysAgo = postedDate ? Math.floor((Date.now() - new Date(postedDate)) / (1000 * 60 * 60 * 24)) : null;
      const dateText = daysAgo !== null 
        ? (daysAgo === 0 ? '🆕 Publicada hoy' : daysAgo === 1 ? '📅 Publicada ayer' : `📅 Publicada hace ${daysAgo} días`)
        : '📅 Fecha no disponible';
      
      const finalMessage = `${generatedText.trim()}\n\n${dateText}\n\n🔗 *Postula aquí:*\n${link}\n\n📊 _Fuente: ${source}_`;
      return finalMessage;
    } else {
      throw new Error('No se generó contenido');
    }

  } catch (error) {
    if (error.message.includes('API_KEY') || error.message.includes('quota')) {
      console.log('⚠️ Gemini AI no disponible, usando descripción automática');
    }
    
    return generateSmartJobDescription(jobTitle, company, description, category, salary, location, link, source, postedDate);
  }
}

/**
 * Genera una descripción inteligente sin IA para ofertas laborales
 */
function generateSmartJobDescription(jobTitle, company, description, category, salary, location, link, source, postedDate) {
  const categoryEmojis = {
    FRONTEND: '💻',
    BACKEND: '⚙️',
    MOBILE: '📱',
    DESIGNER: '🎨',
    DATABASE: '🗄️',
    DATA_ANALYST: '📊',
    CYBERSECURITY: '🔒'
  };
  
  const emoji = categoryEmojis[category] || '💼';
  
  const cleanDescription = description
    .replace(/<[^>]*>/g, '')
    .replace(/\n+/g, ' ')
    .substring(0, 400)
    .trim();
  
  // Calcular antigüedad de la oferta
  const daysAgo = postedDate ? Math.floor((Date.now() - new Date(postedDate)) / (1000 * 60 * 60 * 24)) : null;
  const dateText = daysAgo !== null 
    ? (daysAgo === 0 ? '🆕 Publicada hoy' : daysAgo === 1 ? '📅 Publicada ayer' : `📅 Publicada hace ${daysAgo} días`)
    : '📅 Fecha no disponible';
  
  let message = `${emoji} *${jobTitle}*\n\n`;
  message += `🏢 *Empresa:* ${company}\n`;
  message += `📍 *Ubicación:* ${location}\n`;
  
  if (salary && salary !== 'No especificado') {
    message += `💰 *Salario:* ${salary}\n`;
  }
  
  message += `${dateText}\n`;
  message += `\n📝 *Descripción:*\n${cleanDescription}${cleanDescription.length >= 400 ? '...' : ''}\n`;
  message += `\n🎯 *Categoría:* ${category.replace(/_/g, ' ')}\n`;
  message += `\n🔗 *Postula aquí:*\n${link}\n`;
  message += `\n📊 _Fuente: ${source}_`;
  
  return message;
}

module.exports = {
  enhanceJobDescription,
  generateSmartJobDescription
};
