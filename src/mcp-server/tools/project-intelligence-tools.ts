import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ProjectIntelligenceEngine } from '../../engines/project-intelligence-engine.js';
import {
  FeatureMapping,
  ProjectBlueprint,
  ProjectDecisionRecord,
  SQLiteDatabase,
  WorkSessionRecord
} from '../../storage/sqlite-db.js';
import { z } from 'zod';
import { resolve } from 'path';
import { nanoid } from 'nanoid';

export class ProjectIntelligenceTools {
  constructor(
    private readonly projectEngine: ProjectIntelligenceEngine,
    private readonly database: SQLiteDatabase
  ) {}

  get tools(): Tool[] {
    return [
      {
        name: 'project_intelligence.get_blueprint',
        description: 'Retrieve the cached project blueprint, generating one if absent',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: {
              type: 'string',
              description: 'Path to the project (defaults to current working directory)'
            },
            refresh: {
              type: 'boolean',
              description: 'Force regeneration of the blueprint from source analysis'
            }
          }
        }
      },
      {
        name: 'project_intelligence.find_feature_files',
        description: 'Look up files associated with a named feature or namespace',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: {
              type: 'string',
              description: 'Path to the project (defaults to current working directory)'
            },
            feature: {
              type: 'string',
              description: 'Feature/namespace identifier to resolve'
            }
          },
          required: ['feature']
        }
      },
      {
        name: 'work_memory.resume_session',
        description: 'Resume the most recent work session or a specific session id',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: {
              type: 'string',
              description: 'Path to the project (defaults to current working directory)'
            },
            sessionId: {
              type: 'string',
              description: 'Optional explicit session id to resume'
            }
          }
        }
      },
      {
        name: 'work_memory.update_context',
        description: 'Persist current work context (files, tasks, blockers, notes) for a session',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: { type: 'string' },
            sessionId: { type: 'string' },
            lastFeature: { type: 'string' },
            currentFiles: {
              type: 'array',
              items: { type: 'string' }
            },
            appendCurrentFiles: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional file list to append to existing tracked files'
            },
            pendingTasks: {
              type: 'array',
              items: { type: 'string' }
            },
            completedTasks: {
              type: 'array',
              items: { type: 'string' }
            },
            blockers: {
              type: 'array',
              items: { type: 'string' }
            },
            sessionNotes: { type: 'string' }
          }
        }
      },
      {
        name: 'work_memory.record_decision',
        description: 'Capture architectural/implementation decisions for future recall',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: { type: 'string' },
            decisionKey: {
              type: 'string',
              description: 'Stable identifier such as auth_strategy or testing_framework'
            },
            decisionValue: { type: 'string' },
            reasoning: { type: 'string' }
          },
          required: ['decisionKey', 'decisionValue']
        }
      }
    ];
  }

  async getProjectBlueprint(args: { projectPath?: string; refresh?: boolean }): Promise<ProjectBlueprint | null> {
    const projectPath = this.normalizeProjectPath(args.projectPath);

    if (args.refresh) {
      await this.projectEngine.generateBlueprint({ projectPath });
    }

    const blueprint = this.database.getProjectBlueprint(projectPath);
    if (blueprint) {
      return blueprint;
    }

    await this.projectEngine.generateBlueprint({ projectPath });
    return this.database.getProjectBlueprint(projectPath);
  }

  async findFeatureFiles(args: { projectPath?: string; feature: string }): Promise<FeatureMapping | null> {
    const projectPath = this.normalizeProjectPath(args.projectPath);
    const features = this.database.listFeatureMap(projectPath);
    const normalizedFeature = args.feature.toLowerCase();
    return features.find((feature) => feature.featureName.toLowerCase() === normalizedFeature) ?? null;
  }

  async resumeSession(args: { projectPath?: string; sessionId?: string }): Promise<WorkSessionRecord | null> {
    const projectPath = this.normalizeProjectPath(args.projectPath);
    if (args.sessionId) {
      return this.database.getWorkSession(args.sessionId);
    }

    const sessions = this.database.listActiveWorkSessions(projectPath);
    return sessions.length > 0 ? sessions[0] : null;
  }

  async updateWorkContext(args: {
    projectPath?: string;
    sessionId?: string;
    lastFeature?: string;
    currentFiles?: string[];
    appendCurrentFiles?: string[];
    pendingTasks?: string[];
    completedTasks?: string[];
    blockers?: string[];
    sessionNotes?: string;
  }): Promise<WorkSessionRecord> {
    const projectPath = this.normalizeProjectPath(args.projectPath);
    const sessionId = args.sessionId ?? `agent:${projectPath}`;
    const existing = this.database.getWorkSession(sessionId);

    const currentFilesSet = new Set<string>(existing?.currentFiles ?? []);
    if (args.currentFiles) {
      currentFilesSet.clear();
      args.currentFiles.forEach((file) => currentFilesSet.add(file));
    }
    if (args.appendCurrentFiles) {
      args.appendCurrentFiles.forEach((file) => currentFilesSet.add(file));
    }

    const pendingTasks = args.pendingTasks ?? existing?.pendingTasks ?? [];
    const completedTasks = args.completedTasks ?? existing?.completedTasks ?? [];
    const blockers = args.blockers ?? existing?.blockers ?? [];

    this.database.upsertWorkSession({
      sessionId,
      projectPath,
      lastFeature: args.lastFeature ?? existing?.lastFeature ?? null,
      currentFiles: Array.from(currentFilesSet),
      completedTasks,
      pendingTasks,
      blockers,
      sessionNotes: args.sessionNotes ?? existing?.sessionNotes ?? null
    });

    const updated = this.database.getWorkSession(sessionId);
    if (!updated) {
      throw new Error('Failed to persist work session context');
    }
    return updated;
  }

  async recordDecision(args: {
    projectPath?: string;
    decisionKey: string;
    decisionValue: string;
    reasoning?: string;
  }): Promise<ProjectDecisionRecord> {
    const projectPath = this.normalizeProjectPath(args.projectPath);
    this.database.upsertProjectDecision({
      id: nanoid(),
      projectPath,
      decisionKey: args.decisionKey,
      decisionValue: args.decisionValue,
      reasoning: args.reasoning ?? null,
      madeAt: new Date()
    });

    const decisions = this.database.listProjectDecisions(projectPath);
    return decisions.find((d) => d.decisionKey === args.decisionKey)!;
  }

  private normalizeProjectPath(projectPath?: string): string {
    const base =
      projectPath && projectPath.trim().length > 0
        ? projectPath
        : process.cwd();
    return resolve(base);
  }
}

// Zod schemas for validation (exported for validation registry)
export const GetBlueprintSchema = z.object({
  projectPath: z.string().optional(),
  refresh: z.boolean().optional().default(false)
});

export const FindFeatureFilesSchema = z.object({
  projectPath: z.string().optional(),
  feature: z.string().min(1, 'Feature name is required')
});

export const ResumeSessionSchema = z.object({
  projectPath: z.string().optional(),
  sessionId: z.string().optional()
});

export const UpdateWorkContextSchema = z.object({
  projectPath: z.string().optional(),
  sessionId: z.string().optional(),
  lastFeature: z.string().optional(),
  currentFiles: z.array(z.string()).optional(),
  appendCurrentFiles: z.array(z.string()).optional(),
  pendingTasks: z.array(z.string()).optional(),
  completedTasks: z.array(z.string()).optional(),
  blockers: z.array(z.string()).optional(),
  sessionNotes: z.string().optional()
});

export const RecordDecisionSchema = z.object({
  projectPath: z.string().optional(),
  decisionKey: z.string().min(1, 'decisionKey is required'),
  decisionValue: z.string().min(1, 'decisionValue is required'),
  reasoning: z.string().optional()
});
