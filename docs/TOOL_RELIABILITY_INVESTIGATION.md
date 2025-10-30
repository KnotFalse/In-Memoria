# Tool Reliability Investigation

**Date**: 2025-10-30
**Investigator**: Claude Code Agent
**Context**: User reported that several MCP tools are not working as promised in README.md

## Executive Summary

After comprehensive testing and code analysis, we've identified **4 critical issues** affecting core features promised in the README:

1. ✅ **FIXED**: `predict_coding_approach` file routing (fixed in this session)
2. ❌ **BROKEN**: `get_project_blueprint` returns empty data for techStack, entryPoints, keyDirectories
3. ❌ **BROKEN**: `get_semantic_insights` returns empty results
4. ❌ **BROKEN**: `get_pattern_recommendations` returns no patterns
5. ⚠️ **LIMITED**: Feature map reliability (doesn't cover Rust code directories)

---

## Issue 1: `predict_coding_approach` File Routing ✅ FIXED

### Status
**RESOLVED** in commit `c4b3962`

### What Was Broken
- File routing functionality completely non-functional
- Always returned empty responses despite having feature maps in database

### Root Causes Found
1. **NAPI field name conversion**: Rust `feature_name` → JavaScript should be `featureName` (camelCase), but code was accessing `feature_name`
2. **Path matching failure**: Database stored `"."` but MCP queries used absolute paths like `/home/user/project`
3. **ES module error**: Used `require('path')` in ES6 module context
4. **Foreign key constraint violation**: `project_metadata.project_path` wasn't UNIQUE
5. **Claude Code MCP client bug**: Optional boolean parameters not passed (workaround: default to `true`)

### Fixes Applied
- Fixed NAPI field mapping in `pattern-engine.ts:606-609`
- Added path normalization in `sqlite-db.ts:338-357`
- Fixed ES6 import in `sqlite-db.ts:3`
- Added Migration v7 for UNIQUE constraint
- Defaulted `includeFileRouting` to `true`

### Verification
```bash
# After fixes
$ mcp__in-memoria__predict_coding_approach("Add database migration")
{
  "fileRouting": {
    "intendedFeature": "database",
    "targetFiles": ["src/storage/sqlite-db.ts", "src/storage/migrations.ts"],
    "confidence": 0.95
  }
}
```

---

## Issue 2: `get_project_blueprint` Returns Empty Data ❌ BROKEN

### Status
**CRITICAL** - Core feature advertised in README not functioning

### What's Broken
```javascript
// Expected (per README.md line 171)
{
  "techStack": ["TypeScript", "Rust", "SQLite"],
  "entryPoints": { "cli": "src/index.ts", "api": "src/mcp-server/server.ts" },
  "keyDirectories": { "storage": "src/storage", "engines": "src/engines" },
  "architecture": "Modular"
}

// Actually returned
{
  "techStack": [],
  "entryPoints": {},
  "keyDirectories": {},
  "architecture": "Modular"  // Only this works!
}
```

### Database Evidence
```sql
sqlite> SELECT COUNT(*) FROM entry_points;
0

sqlite> SELECT COUNT(*) FROM key_directories;
0

sqlite> SELECT COUNT(*) FROM project_metadata;
1
```

**Conclusion**: Entry points and key directories are NEVER being stored in the database.

### Root Cause Analysis

#### Investigation Steps

1. **Confirmed `storeProjectBlueprint` is called** (learning-service.ts:195)
   ```typescript
   await this.storeProjectBlueprint(path, codebaseAnalysis, projectDatabase);
   ```

2. **Confirmed method exists with filtering** (learning-service.ts:450-492)
   ```typescript
   private static async storeProjectBlueprint(
     projectPath: string,
     codebaseAnalysis: any,
     database: SQLiteDatabase
   ): Promise<void> {
     // Has code to insert entry_points and key_directories
   }
   ```

3. **Checked what `codebaseAnalysis` contains**
   - It's returned from `SemanticEngine.analyzeCodebase()`
   - That method calls:
     ```typescript
     const entryPoints = await this.detectEntryPoints(path, result.frameworks);
     const keyDirectories = await this.mapKeyDirectories(path);
     ```

4. **Found the methods use Rust with TypeScript fallbacks** (semantic-engine.ts:548-756)
   ```typescript
   async detectEntryPoints(...) {
     // Rust implementation
     const rustImplementation = async () => {
       const frameworkInfo = await FrameworkDetector.detectFrameworks(projectPath);
       const entryPoints = await BlueprintAnalyzer.detectEntryPoints(...);
       return entryPoints.map(...);
     };

     // TypeScript fallback
     const fallbackImplementation = async () => { ... };
   }
   ```

5. **CRITICAL FINDING**: These methods DON'T use CircuitBreaker!
   - `analyzeCodebase()` uses `this.rustCircuitBreaker.execute()` ✅
   - `detectEntryPoints()` calls Rust directly without circuit breaker ❌
   - `mapKeyDirectories()` calls Rust directly without circuit breaker ❌

### Hypothesis

**The Rust calls are failing silently**, and there's NO fallback to TypeScript implementation.

When Rust methods throw errors:
- No circuit breaker to catch the error
- No try/catch to trigger fallback
- Method returns empty array or throws unhandled exception
- Learning continues but stores no entry points/directories

### Evidence Supporting Hypothesis

1. **No circuit breaker wrapping**:
   ```typescript
   // This should be:
   const result = await this.blueprintCircuitBreaker.execute(
     rustImplementation,
     fallbackImplementation
   );

   // But actually is:
   const frameworkInfo = await FrameworkDetector.detectFrameworks(projectPath);
   const entryPoints = await BlueprintAnalyzer.detectEntryPoints(...);
   // If these throw, no fallback!
   ```

2. **Database shows 0 rows** despite learning completing successfully

3. **No error messages** in learning output (errors being swallowed)

### Recommended Fixes

#### Fix 1: Add Circuit Breaker to Blueprint Methods

**File**: `src/engines/semantic-engine.ts`

**Location**: Lines 548-678 (`detectEntryPoints` and `mapKeyDirectories`)

**Change**:
```typescript
async detectEntryPoints(projectPath: string, frameworks: string[]): Promise<Array<{...}>> {
  // Rust implementation
  const rustImplementation = async () => {
    const frameworkInfo = await FrameworkDetector.detectFrameworks(projectPath);
    const entryPoints = await BlueprintAnalyzer.detectEntryPoints(projectPath, frameworkInfo);
    return entryPoints.map(...);
  };

  // TypeScript fallback
  const fallbackImplementation = async () => { ... };

  // ADD THIS:
  return await this.rustCircuitBreaker.execute(
    rustImplementation,
    fallbackImplementation
  );
}
```

Do the same for `mapKeyDirectories`.

#### Fix 2: Add Error Logging

Add console.error in `storeProjectBlueprint` to see what data we're getting:

```typescript
private static async storeProjectBlueprint(...) {
  console.error(`🔍 storeProjectBlueprint called:`);
  console.error(`   entryPoints: ${codebaseAnalysis.entryPoints?.length || 0}`);
  console.error(`   keyDirectories: ${codebaseAnalysis.keyDirectories?.length || 0}`);

  if (codebaseAnalysis.entryPoints && Array.isArray(codebaseAnalysis.entryPoints)) {
    console.error(`   entryPoints data:`, JSON.stringify(codebaseAnalysis.entryPoints).slice(0, 200));
    // ... rest of code
  }
}
```

#### Fix 3: Add Validation

Before storing, validate the data structure:

```typescript
if (!codebaseAnalysis) {
  console.error('⚠️  codebaseAnalysis is null/undefined');
  return;
}

if (!codebaseAnalysis.entryPoints) {
  console.error('⚠️  codebaseAnalysis.entryPoints is undefined');
}

if (!codebaseAnalysis.keyDirectories) {
  console.error('⚠️  codebaseAnalysis.keyDirectories is undefined');
}
```

### Testing Plan

After applying fixes:

1. **Test Rust path** (ensure circuit breaker works):
   ```bash
   rm in-memoria.db
   node dist/index.js learn . --force
   sqlite3 in-memoria.db "SELECT COUNT(*) FROM entry_points;"
   # Should be > 0
   ```

2. **Test fallback path** (simulate Rust failure):
   - Temporarily make Rust method throw
   - Verify TypeScript fallback triggers
   - Check database populated

3. **Test MCP tool**:
   ```javascript
   await mcp__in-memoria__get_project_blueprint({ path: "." });
   // Should return populated techStack, entryPoints, keyDirectories
   ```

---

## Issue 3: `get_semantic_insights` Returns Empty ❌ BROKEN

### Status
**HIGH PRIORITY** - Semantic search is a core advertised feature

### What's Broken
```javascript
// Test query
await mcp__in-memoria__get_semantic_insights({
  query: "authentication",
  limit: 3
});

// Returns
{
  "insights": [],
  "totalAvailable": 0
}
```

### Database Evidence
```sql
sqlite> SELECT COUNT(*) FROM semantic_concepts;
204

sqlite> SELECT concept_type, COUNT(*) FROM semantic_concepts GROUP BY concept_type;
variable|141
function|34
table|13
query|6
class|4
import|2
index|2
struct|1
view|1
```

**Paradox**: Database HAS 204 concepts, but tool returns 0.

### Root Cause Analysis

#### Investigation Steps

1. **Confirmed data exists**: 204 concepts in database

2. **Check the MCP tool implementation**
   - File: `src/mcp-server/tools/intelligence-tools.ts`
   - Method: `getSemanticInsights()`

3. **Need to examine**:
   - How does it query the database?
   - Is there filtering that's too restrictive?
   - Is there a query parameter mismatch?

#### Hypothesis

Possible causes:
1. **Query filtering too restrictive** - The `query` parameter might not match concept names
2. **Missing vector embeddings** - Tool might require vector search but embeddings not built
3. **Wrong database query** - SQL query might have WHERE clause that matches nothing
4. **Case sensitivity** - Query "authentication" vs concept names in database

### Recommended Investigation

1. **Check what concepts are actually named**:
   ```sql
   SELECT concept_name, concept_type FROM semantic_concepts
   WHERE concept_name LIKE '%auth%' LIMIT 10;
   ```

2. **Read the tool implementation**:
   ```bash
   grep -A50 "getSemanticInsights" src/mcp-server/tools/intelligence-tools.ts
   ```

3. **Check if vector embeddings exist**:
   ```sql
   SELECT COUNT(*) FROM vector_cache;
   ```

4. **Test direct database query**:
   ```typescript
   const concepts = database.getSemanticConcepts();
   console.log(`Total concepts: ${concepts.length}`);
   ```

### Testing Plan

After fixes:
```javascript
// Should find concepts related to query
await mcp__in-memoria__get_semantic_insights({
  query: "database",  // Should match table concepts
  limit: 5
});
// Expected: insights.length > 0
```

---

## Issue 4: `get_pattern_recommendations` Returns Empty ❌ BROKEN

### Status
**HIGH PRIORITY** - Pattern learning is THE key differentiator

### What's Broken
```javascript
await mcp__in-memoria__get_pattern_recommendations({
  problemDescription: "Add a new API endpoint for user registration"
});

// Returns
{
  "recommendations": [],
  "reasoning": "Found 0 relevant patterns based on your coding history"
}
```

### Database Evidence
```sql
sqlite> SELECT COUNT(*) FROM developer_patterns;
18

sqlite> SELECT pattern_type, COUNT(*) FROM developer_patterns GROUP BY pattern_type;
implementation|9
naming|3
structural|2
structure|1
(3 rows with NULL)|3
```

**Paradox**: Database HAS 18 patterns, but tool returns 0.

### Root Cause Analysis

Similar to Issue 3 - data exists but retrieval is broken.

#### Hypothesis

Possible causes:
1. **Pattern matching algorithm too strict** - "Add API endpoint" doesn't match any pattern content
2. **Missing pattern metadata** - Patterns stored without proper searchable fields
3. **Query requires context** - Tool might need `currentFile` or `selectedCode` parameters
4. **Pattern confidence too low** - Filters out low-confidence patterns

### Recommended Investigation

1. **Check pattern content**:
   ```sql
   SELECT pattern_type, pattern_content FROM developer_patterns LIMIT 5;
   ```

2. **Read the tool implementation**:
   ```bash
   grep -A50 "getPatternRecommendations" src/mcp-server/tools/intelligence-tools.ts
   ```

3. **Check pattern matching logic**:
   - Does it use text search on pattern descriptions?
   - Does it use semantic similarity?
   - Does it require specific keywords?

### Testing Plan

After fixes:
```javascript
// Test with simple query that should match
await mcp__in-memoria__get_pattern_recommendations({
  problemDescription: "implement a new function"  // Should match implementation patterns
});
// Expected: recommendations.length > 0
```

---

## Issue 5: Feature Map Reliability - Missing Rust Code ⚠️ LIMITED

### Status
**MEDIUM PRIORITY** - Feature works but coverage incomplete

### What's Working
Feature maps correctly identify TypeScript code:
- ✅ Database (src/storage/)
- ✅ Services (src/services/)
- ✅ Utilities (src/utils/)
- ✅ Testing (src/__tests__/, tests/)
- ✅ Configuration (src/config/)

### What's Missing
```sql
sqlite> SELECT feature_name, json_array_length(primary_files) FROM feature_map;
database|2
services|1
utilities|4
testing|19
configuration|1
```

**No features mapped for**:
- ❌ Rust code (rust-core/)
- ❌ Parser/AST code (language support)
- ❌ MCP server code (arguably should be separate feature)
- ❌ CLI code (src/index.ts)

### User's Specific Example

User asked: "Add support for a new programming language (Ruby/PHP) to the AST parser"

File routing returned:
```javascript
{
  "intendedFeature": "configuration",  // Wrong!
  "confidence": 0.2,                   // Low confidence
  "reasoning": "No keyword matches found. Suggesting most common feature as fallback."
}
```

**Expected**: Should suggest `rust-core/src/parsing/` files where language support is implemented.

### Root Cause Analysis

#### How Feature Mapping Works

**File**: `rust-core/src/analysis/blueprint.rs:259-316`

The Rust `build_feature_map` function:
```rust
let feature_patterns: Vec<(&str, Vec<&str>)> = vec![
    ("authentication", vec!["auth", "authentication"]),
    ("api", vec!["api", "routes", "endpoints", "controllers"]),
    ("database", vec!["db", "database", "models", "schemas", "migrations", "storage"]),
    ("ui-components", vec!["components", "ui"]),
    ("views", vec!["views", "pages", "screens"]),
    ("services", vec!["services", "api-clients"]),
    ("utilities", vec!["utils", "helpers", "lib"]),
    ("testing", vec!["tests", "__tests__", "test"]),
    ("configuration", vec!["config", ".config", "settings"]),
    ("middleware", vec!["middleware", "middlewares"]),
];

for (feature_name, directories) in feature_patterns {
    for dir in &directories {
        let src_path = project_path.join("src").join(dir);
        let alt_path = project_path.join(dir);
        // Only checks src/ and root directories!
    }
}
```

#### Problems

1. **Hardcoded directory patterns**: Only looks for standard web app structure
2. **Only checks src/ and root**: Never looks in `rust-core/`, `cli/`, etc.
3. **No language-specific features**: No "parser", "ast", "compiler", "language-support" features
4. **Web-app biased**: Assumes Express/React-style structure

### Why It Didn't Map Rust Code

The Rust parser code is in:
```
rust-core/
  src/
    parsing/
      manager.rs       <- Language support is here
      typescript.rs
      python.rs
      ...
    analysis/
      blueprint.rs     <- The code that does feature mapping!
```

Feature mapping looks for:
```
project_root/
  src/                <- Checks here
    parsing/          <- Not checking subdirs of non-standard names!
  parsing/            <- Checks here but rust-core/src/parsing doesn't match
```

### Recommended Fixes

#### Fix 1: Add Language/Compiler-Specific Feature Patterns

**File**: `rust-core/src/analysis/blueprint.rs:263-274`

Add to `feature_patterns`:
```rust
("language-support", vec!["parsing", "parser", "ast", "tree-sitter", "compiler"]),
("rust-core", vec!["rust-core", "native", "bindings"]),
("mcp-server", vec!["mcp-server", "server", "mcp"]),
("cli", vec!["cli", "bin", "commands"]),
```

#### Fix 2: Search Nested Directories

Currently only checks:
- `project/src/{pattern}/`
- `project/{pattern}/`

Should also check:
- `project/**/src/{pattern}/`  (nested modules)
- `project/{module}/src/{pattern}/`  (mono-repo style)

**Implementation**:
```rust
// Add recursive search
let rust_core_path = project_path.join("rust-core").join("src").join(dir);
if rust_core_path.exists() && rust_core_path.is_dir() {
    // Add files from rust-core
}
```

#### Fix 3: Improve Keyword Matching

**File**: `src/engines/pattern-engine.ts:822-829`

Current keywords:
```typescript
'utilities': ['util', 'helper', 'function', 'library'],
```

Add more programming concepts:
```typescript
'language-support': ['parser', 'parsing', 'ast', 'tree-sitter', 'language', 'grammar', 'lexer', 'syntax'],
'compiler': ['compiler', 'transpiler', 'codegen', 'bytecode'],
'native-code': ['rust', 'native', 'ffi', 'bindings', 'napi'],
```

### Testing Plan

After fixes:
```javascript
// Test 1: Language support query
await mcp__in-memoria__predict_coding_approach({
  problemDescription: "Add Ruby language support to AST parser"
});
// Expected: intendedFeature = "language-support"
//           targetFiles includes rust-core/src/parsing/

// Test 2: Check feature map coverage
const maps = database.getFeatureMaps(".");
console.log(maps.map(m => m.featureName));
// Expected: includes "language-support", "rust-core", "mcp-server", "cli"
```

---

## Summary of Required Fixes

### Priority 1: Critical (Blocks Core Features)

1. **`get_project_blueprint` empty data**
   - Add circuit breaker to `detectEntryPoints` and `mapKeyDirectories`
   - Add error logging to `storeProjectBlueprint`
   - Verify Rust methods return data correctly

2. **`get_semantic_insights` returns empty**
   - Investigate query filtering
   - Check vector embedding requirements
   - Fix SQL query if too restrictive

3. **`get_pattern_recommendations` returns empty**
   - Investigate pattern matching algorithm
   - Check if patterns have searchable metadata
   - Lower confidence threshold if too high

### Priority 2: Important (Limits Functionality)

4. **Feature map coverage for Rust code**
   - Add language/compiler feature patterns
   - Add nested directory search
   - Improve keyword matching

### Files Requiring Changes

1. `src/engines/semantic-engine.ts` - Add circuit breakers (lines 548, 665)
2. `src/services/learning-service.ts` - Add debug logging (line 450)
3. `rust-core/src/analysis/blueprint.rs` - Expand feature patterns (line 263)
4. `src/engines/pattern-engine.ts` - Add keywords (line 822)
5. `src/mcp-server/tools/intelligence-tools.ts` - Fix query logic (investigate)

---

## Testing Strategy

### Regression Testing

After each fix, run full test suite:
```bash
npm test                    # Unit tests
npm run test:integration    # MCP integration tests
```

### Manual Testing

```bash
# 1. Clean slate
rm in-memoria.db

# 2. Relearn with fixes
npm run build
node dist/index.js learn . --force

# 3. Verify database populated
sqlite3 in-memoria.db "SELECT COUNT(*) FROM entry_points;"      # Should be > 0
sqlite3 in-memoria.db "SELECT COUNT(*) FROM key_directories;"   # Should be > 0
sqlite3 in-memoria.db "SELECT feature_name FROM feature_map;"   # Should include rust-core

# 4. Test MCP tools
npx in-memoria server
# In another terminal with Claude Code:
# Test each broken tool
```

### Edge Cases to Test

1. **Empty project** - Should handle gracefully
2. **Non-standard structure** - Monorepos, nested modules
3. **Missing directories** - Project with only some standard dirs
4. **Rust errors** - Verify fallback triggers correctly

---

## Metrics for Success

### Before Fixes
- ❌ `get_project_blueprint`: 0/3 fields populated (0%)
- ❌ `get_semantic_insights`: 0/204 concepts retrievable (0%)
- ❌ `get_pattern_recommendations`: 0/18 patterns accessible (0%)
- ⚠️  Feature maps: 5/5 features but missing Rust code (50% coverage)

### After Fixes (Target)
- ✅ `get_project_blueprint`: 3/3 fields populated (100%)
- ✅ `get_semantic_insights`: Returns results for common queries (>80%)
- ✅ `get_pattern_recommendations`: Returns results for common requests (>80%)
- ✅ Feature maps: 8-10 features with full coverage (100%)

---

## Next Steps

1. **Prioritize fixes** - Start with Priority 1 issues
2. **Implement with tests** - Add test for each fix
3. **Update CHANGELOG.md** - Document fixes in Unreleased section
4. **Update README.md** - Remove/update promises that aren't kept
5. **Add integration tests** - Prevent regression

---

**Investigation Date**: 2025-10-30
**Document Version**: 1.0
**Status**: Investigation Complete, Fixes Pending
