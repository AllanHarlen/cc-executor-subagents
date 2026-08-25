#!/usr/bin/env node
/**
 * Compatibility wrapper.
 *
 * The canonical project-config script lives inside the skill directory so
 * SKILL.md can reference it through ${CLAUDE_SKILL_DIR}. Keep this wrapper for
 * README examples and command invocations that point at scripts/project-config.mjs.
 */
import "../skills/executor-subagents/scripts/project-config.mjs";
