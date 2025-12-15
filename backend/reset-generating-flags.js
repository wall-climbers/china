#!/usr/bin/env node
/**
 * Script to reset generatingVideo and generating flags in edited_scenes
 * 
 * Usage: 
 *   node reset-generating-flags.js <sessionId>
 * 
 * Example:
 *   node reset-generating-flags.js 76afef8c-fb57-425d-b430-337d380d32d5
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function resetGeneratingFlags(sessionId) {
  console.log(`🔄 Resetting generating flags for session: ${sessionId}`);
  
  try {
    // 1. Fetch the current session to see edited_scenes
    console.log('📋 Fetching session...');
    const sessions = await prisma.$queryRawUnsafe(
      `SELECT id, edited_scenes, scenes FROM ugc_sessions WHERE id = '${sessionId}'`
    );
    
    if (sessions.length === 0) {
      console.error('❌ Session not found');
      return false;
    }
    
    const session = sessions[0];
    console.log('   Session found:', session.id);
    
    // 2. Update edited_scenes - reset generating flags
    let editedScenes = session.edited_scenes || [];
    if (typeof editedScenes === 'string') {
      editedScenes = JSON.parse(editedScenes);
    }
    
    console.log('   Found', editedScenes.length, 'edited scenes');
    
    const updatedEditedScenes = editedScenes.map((scene, index) => {
      const wasGenerating = scene.generating || scene.generatingVideo;
      const hasIncompleteProgress = scene.videoProgress !== undefined && scene.videoProgress !== 100;
      
      if (wasGenerating || hasIncompleteProgress) {
        console.log(`   Scene ${index + 1}: generatingVideo=${scene.generatingVideo}, videoProgress=${scene.videoProgress}`);
      }
      
      const updatedScene = {
        ...scene,
        generating: false,
        generatingVideo: false
      };
      
      // Remove videoProgress if not 100
      if (updatedScene.videoProgress !== undefined && updatedScene.videoProgress !== 100) {
        console.log(`   Scene ${index + 1}: removing videoProgress (was ${updatedScene.videoProgress})`);
        delete updatedScene.videoProgress;
      }
      
      return updatedScene;
    });
    
    // 3. Also update scenes field
    let scenes = session.scenes || [];
    if (typeof scenes === 'string') {
      scenes = JSON.parse(scenes);
    }
    
    console.log('   Found', scenes.length, 'scenes');
    
    const updatedScenes = scenes.map((scene, index) => {
      const wasGenerating = scene.generating || scene.generatingVideo;
      const hasIncompleteProgress = scene.videoProgress !== undefined && scene.videoProgress !== 100;
      
      if (wasGenerating || hasIncompleteProgress) {
        console.log(`   Scene ${index + 1} (scenes): generatingVideo=${scene.generatingVideo}, videoProgress=${scene.videoProgress}`);
      }
      
      const updatedScene = {
        ...scene,
        generating: false,
        generatingVideo: false
      };
      
      // Remove videoProgress if not 100
      if (updatedScene.videoProgress !== undefined && updatedScene.videoProgress !== 100) {
        console.log(`   Scene ${index + 1} (scenes): removing videoProgress (was ${updatedScene.videoProgress})`);
        delete updatedScene.videoProgress;
      }
      
      return updatedScene;
    });
    
    // 4. Update the database
    console.log('\n💾 Updating database...');
    const editedScenesJson = JSON.stringify(updatedEditedScenes).replace(/'/g, "''");
    const scenesJson = JSON.stringify(updatedScenes).replace(/'/g, "''");
    
    await prisma.$executeRawUnsafe(
      `UPDATE ugc_sessions 
       SET edited_scenes = '${editedScenesJson}'::jsonb,
           scenes = '${scenesJson}'::jsonb,
           updated_at = NOW()
       WHERE id = '${sessionId}'`
    );
    
    console.log(`\n✅ Session ${sessionId} generating flags reset successfully!`);
    console.log('   All generating and generatingVideo flags set to false');
    return true;
    
  } catch (error) {
    console.error('❌ Failed to reset generating flags:', error.message);
    console.error(error.stack);
    return false;
  }
}

async function main() {
  console.log('🔧 Reset Generating Flags Tool\n');
  console.log('─'.repeat(50) + '\n');

  const sessionId = process.argv[2] || '76afef8c-fb57-425d-b430-337d380d32d5';
  
  if (!sessionId) {
    console.log('Usage: node reset-generating-flags.js <sessionId>');
    process.exit(1);
  }
  
  await resetGeneratingFlags(sessionId);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('Error:', error);
  await prisma.$disconnect();
  process.exit(1);
});

