#!/usr/bin/env node

import { SemanticEngine } from './dist/engines/semantic-engine.js';
import { PatternEngine } from './dist/engines/pattern-engine.js';
import { SQLiteDatabase } from './dist/storage/sqlite-db.js';
import { SemanticVectorDB } from './dist/storage/vector-db.js';
import { IntelligenceTools } from './dist/mcp-server/tools/intelligence-tools.js';

async function testLearning() {
  console.log('🚀 Testing In Memoria Learning Pipeline...\n');

  try {
    // Initialize components
    const database = new SQLiteDatabase('./test-cartographer.db');
    const vectorDB = new SemanticVectorDB();
    const semanticEngine = new SemanticEngine(database, vectorDB);
    const patternEngine = new PatternEngine(database);
    const intelligenceTools = new IntelligenceTools(semanticEngine, patternEngine, database);

    // Test learning from the current codebase
    console.log('📚 Learning from codebase...');
    const result = await intelligenceTools.learnCodebaseIntelligence({
      path: './src',
      force: true
    });

    console.log('✅ Learning Results:');
    console.log(`   - Concepts learned: ${result.conceptsLearned}`);
    console.log(`   - Patterns learned: ${result.patternsLearned}`);
    console.log(`   - Time elapsed: ${result.timeElapsed}ms`);
    console.log(`   - Success: ${result.success}`);
    console.log('   - Insights:');
    result.insights.forEach(insight => console.log(`     • ${insight}`));

    console.log('\n🔍 Testing semantic insights...');
    const insights = await intelligenceTools.getSemanticInsights({
      limit: 5
    });

    console.log(`📊 Found ${insights.totalAvailable} total insights, showing ${insights.insights.length}:`);
    insights.insights.forEach(insight => {
      console.log(`   - ${insight.concept} (${insight.usage.frequency.toFixed(1)}% confidence)`);
    });

    console.log('\n🎯 Testing pattern recommendations...');
    const recommendations = await intelligenceTools.getPatternRecommendations({
      problemDescription: 'I need to create a new API endpoint',
      currentFile: './src/api/routes.ts'
    });

    console.log(`💡 Pattern Recommendations (${recommendations.recommendations.length} found):`);
    recommendations.recommendations.forEach(rec => {
      console.log(`   - ${rec.description} (${(rec.confidence * 100).toFixed(1)}% confidence)`);
    });
    console.log(`   Reasoning: ${recommendations.reasoning}`);

    console.log('\n🔮 Testing coding approach prediction...');
    const prediction = await intelligenceTools.predictCodingApproach({
      problemDescription: 'Create a user authentication system',
      context: { language: 'typescript', framework: 'express' }
    });

    console.log(`🎯 Predicted Approach: ${prediction.approach}`);
    console.log(`   Confidence: ${(prediction.confidence * 100).toFixed(1)}%`);
    console.log(`   Reasoning: ${prediction.reasoning}`);
    console.log(`   Complexity: ${prediction.estimatedComplexity}`);
    console.log(`   Suggested patterns: ${prediction.suggestedPatterns.join(', ')}`);

    console.log('\n👤 Testing developer profile...');
    const profile = await intelligenceTools.getDeveloperProfile({
      includeRecentActivity: true
    });

    console.log(`📈 Developer Profile:`);
    console.log(`   - Preferred patterns: ${profile.preferredPatterns.length}`);
    console.log(`   - Naming conventions: ${Object.keys(profile.codingStyle.namingConventions).join(', ')}`);
    console.log(`   - Testing approach: ${profile.codingStyle.testingApproach}`);
    console.log(`   - Expertise areas: ${profile.expertiseAreas.join(', ')}`);
    console.log(`   - Recent focus: ${profile.recentFocus.join(', ')}`);

    database.close();
    console.log('\n✅ All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testLearning();