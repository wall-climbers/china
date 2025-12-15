#!/usr/bin/env node
/**
 * Script to regenerate scenes for a UGC session using the LLM
 * Updates only the scenes data without resetting status
 * 
 * Usage: 
 *   node regenerate-scenes.js <sessionId>
 * 
 * Example:
 *   node regenerate-scenes.js 76afef8c-fb57-425d-b430-337d380d32d5
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function regenerateScenes(sessionId) {
  console.log(`🔄 Regenerating scenes for session: ${sessionId}`);
  
  try {
    // 1. Fetch the session
    console.log('📋 Fetching session...');
    const sessions = await prisma.$queryRawUnsafe(
      `SELECT id, product_id, target_demographic, status
       FROM ugc_sessions 
       WHERE id = '${sessionId}'`
    );
    
    if (sessions.length === 0) {
      console.error('❌ Session not found');
      return false;
    }
    
    const session = sessions[0];
    console.log('   Session found:', session.id);
    console.log('   Product ID:', session.product_id);
    console.log('   Current status:', session.status);
    console.log('   Target demographic:', JSON.stringify(session.target_demographic, null, 2));
    
    // 2. Fetch the product
    console.log('\n📦 Fetching product...');
    const product = await prisma.product.findUnique({
      where: { id: session.product_id }
    });
    
    if (!product) {
      console.error('❌ Product not found');
      return false;
    }
    
    console.log('   Product:', product.title);
    console.log('   Price:', product.price);
    
    // 3. Call the LLM service
    console.log('\n🤖 Calling LLM to regenerate prompts...');
    
    // Dynamic import of the compiled LLM service
    const { llmService } = require('./dist/services/llm');
    
    const demographic = session.target_demographic || {
      ageGroup: '25-34',
      gender: 'All',
      interests: ['Lifestyle'],
      tone: 'Casual',
      countries: []
    };
    
    const result = await llmService.generateProductPrompt(
      {
        title: product.title,
        description: product.description,
        price: product.price
      },
      demographic
    );
    
    console.log('✅ LLM generation complete');
    console.log('   Scenes generated:', result.scenes.length);
    console.log('   Product prompt length:', result.productPrompt?.length);
    
    // Log the scenes with native_dialogue
    console.log('\n📝 Generated scenes:');
    result.scenes.forEach((scene, i) => {
      console.log(`   Scene ${i + 1}: ${scene.title}`);
      console.log(`      Dialogue: ${(scene.dialogue || '').substring(0, 50)}...`);
      console.log(`      Native: ${(scene.native_dialogue || '(empty)').substring(0, 50)}...`);
    });
    
    // 4. Update ONLY the scenes in the database (preserve status, selected_character, selected_product_image)
    console.log('\n💾 Updating scenes in database...');
    console.log('   ⚠️  Preserving: status, selected_character, selected_product_image, generated_characters, generated_product_images');
    const scenesJson = JSON.stringify(result.scenes).replace(/'/g, "''"); // Escape single quotes
    await prisma.$executeRawUnsafe(
      `UPDATE ugc_sessions 
       SET scenes = '${scenesJson}'::jsonb,
           updated_at = NOW()
       WHERE id = '${sessionId}'`
    );
    
    console.log(`\n✅ Session ${sessionId} scenes updated successfully!`);
    console.log('   Status was NOT changed (preserved as:', session.status + ')');
    console.log('   Selected character and product shot were NOT changed');
    return true;
    
  } catch (error) {
    console.error('❌ Failed to regenerate scenes:', error.message);
    console.error(error.stack);
    return false;
  }
}

async function main() {
  console.log('🔧 Scene Regeneration Tool\n');
  console.log('─'.repeat(50) + '\n');

  const sessionId = process.argv[2] || '76afef8c-fb57-425d-b430-337d380d32d5';
  
  if (!sessionId) {
    console.log('Usage: node regenerate-scenes.js <sessionId>');
    process.exit(1);
  }
  
  await regenerateScenes(sessionId);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('Error:', error);
  await prisma.$disconnect();
  process.exit(1);
});

