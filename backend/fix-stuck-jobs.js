const { PrismaClient } = require('@prisma/client');

async function fixStuckScenes() {
  const prisma = new PrismaClient();
  
  try {
    // Find sessions with editedScenes that have stuck generating state
    console.log('🔍 Checking for sessions with stuck scenes...\n');
    
    const sessions = await prisma.$queryRaw`
      SELECT id, edited_scenes 
      FROM ugc_sessions 
      WHERE edited_scenes IS NOT NULL
    `;
    
    console.log(`Found ${sessions.length} sessions with edited scenes\n`);
    
    let fixedCount = 0;
    
    for (const session of sessions) {
      if (!session.edited_scenes) continue;
      
      let scenes = session.edited_scenes;
      let needsUpdate = false;
      
      // Check each scene for stuck state
      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        
        // Check if scene is stuck (has videoUrl but still shows generating)
        if (scene.generatingVideo || scene.videoStatus === 'generating' || scene.videoProgress === 100) {
          console.log(`📍 Session ${session.id}, Scene ${i + 1}:`);
          console.log(`   Dialogue: ${(scene.dialogue || '').substring(0, 60)}...`);
          console.log(`   generatingVideo: ${scene.generatingVideo}`);
          console.log(`   videoStatus: ${scene.videoStatus}`);
          console.log(`   videoProgress: ${scene.videoProgress}`);
          console.log(`   videoUrl: ${scene.videoUrl ? 'YES' : 'NO'}`);
          console.log(`   videos array: ${scene.videos ? scene.videos.length + ' videos' : 'none'}`);
          
          // Fix the stuck state
          if (scene.videoUrl || (scene.videos && scene.videos.length > 0)) {
            scenes[i] = {
              ...scene,
              generatingVideo: false,
              videoStatus: 'completed',
              videoProgress: undefined
            };
            needsUpdate = true;
            console.log(`   ✅ FIXED!\n`);
          } else {
            // No video, just clear the generating state
            scenes[i] = {
              ...scene,
              generatingVideo: false,
              videoStatus: undefined,
              videoProgress: undefined
            };
            needsUpdate = true;
            console.log(`   ✅ Cleared stuck state (no video)\n`);
          }
        }
      }
      
      if (needsUpdate) {
        await prisma.$executeRaw`
          UPDATE ugc_sessions 
          SET edited_scenes = ${JSON.stringify(scenes)}::jsonb,
              updated_at = NOW()
          WHERE id = ${session.id}
        `;
        fixedCount++;
      }
    }
    
    console.log(`\n✅ Fixed ${fixedCount} sessions with stuck scenes`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixStuckScenes();

