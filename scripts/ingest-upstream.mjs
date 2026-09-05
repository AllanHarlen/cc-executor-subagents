#!/usr/bin/env node
/**
 * Compatibility wrapper.
 *
 * The canonical script lives inside the skill directory so SKILL.md can
 * reference it through ${CLAUDE_SKILL_DIR}. Keep this wrapper for README
 * examples and command invocations that point at scripts/ingest-upstream.mjs.
 */
import "../skills/executor-subagents/scripts/ingest-upstream.mjs";
